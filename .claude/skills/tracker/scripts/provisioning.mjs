import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { UUID_RE } from "./constants.mjs";
import { resolveProductionDomains } from "./safety.mjs";

const execFileAsync = promisify(execFile);
const CLI_PACKAGE = "hellyeah";
const RUNNER_COMMANDS = {
  npx: ["npx", ["-y", `${CLI_PACKAGE}@latest`]],
  pnpm: ["pnpm", ["dlx", `${CLI_PACKAGE}@latest`]],
  yarn: ["yarn", ["dlx", `${CLI_PACKAGE}@latest`]],
};
const VERSION_PREFIX_RE = /^v/;

export const minimumCliVersion = "1.0.0";

class ProvisioningError extends Error {
  constructor(reason, message, extra = {}) {
    super(message);
    this.name = "ProvisioningError";
    this.reason = reason;
    Object.assign(this, extra);
  }
}

const createCliSpec = (command, args = []) => ({
  args,
  command,
  display: [command, ...args].join(" "),
});

export const resolveHellyeahCli = (flags = {}) => {
  if (flags["hellyeah-bin"] && flags["hellyeah-bin"] !== true)
    return createCliSpec(String(flags["hellyeah-bin"]));
  if (flags["hellyeah-runner"] && flags["hellyeah-runner"] !== true) {
    const runner = String(flags["hellyeah-runner"]);
    const command = RUNNER_COMMANDS[runner];
    if (!command) {
      throw new ProvisioningError(
        "invalid_runner",
        "--hellyeah-runner must be one of: pnpm, npx, yarn"
      );
    }
    return createCliSpec(command[0], command[1]);
  }
  return createCliSpec(
    String(process.env.HELLYEAH_TRACKER_CLI_BIN ?? "hellyeah")
  );
};

const redactCommandArgs = (args) => {
  const redacted = [...args];
  for (let i = 0; i < redacted.length; i += 1) {
    if (redacted[i] === "--api-key" && i + 1 < redacted.length) {
      redacted[i + 1] = "[redacted]";
      i += 1;
    } else if (redacted[i]?.startsWith("--api-key=")) {
      redacted[i] = "--api-key=[redacted]";
    }
  }
  return redacted;
};

const commandTextFor = (cli, args) =>
  [cli.command, ...redactCommandArgs([...cli.args, ...args])].join(" ");

const parseEnvelope = (stdout, commandText, exitCode) => {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new ProvisioningError(
      "invalid_cli_json",
      `${commandText} returned invalid JSON.`,
      { command: commandText, ...(exitCode ? { exitCode } : {}) }
    );
  }
};

const envelopeErrorFields = (envelope, keys = []) => {
  const fields = { envelope };
  for (const key of keys) {
    if (envelope?.error?.[key]) fields[key] = envelope.error[key];
  }
  return fields;
};

const throwEnvelopeError = (
  envelope,
  fallbackReason,
  fallbackMessage,
  extra = {}
) => {
  throw new ProvisioningError(
    envelope?.error?.code ?? fallbackReason,
    envelope?.error?.message ?? fallbackMessage,
    {
      ...extra,
      ...envelopeErrorFields(envelope, ["nextAction", "existing", "orgs"]),
    }
  );
};

const compareVersions = (actual, minimum) => {
  const normalize = (value) =>
    String(value)
      .trim()
      .replace(VERSION_PREFIX_RE, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10));
  const a = normalize(actual);
  const b = normalize(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = Number.isFinite(a[i]) ? a[i] : 0;
    const right = Number.isFinite(b[i]) ? b[i] : 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
};

export const assertMinimumCliVersion = async (cli, cwd) => {
  const args = ["--version"];
  const commandArgs = [...cli.args, ...args];
  const command = commandTextFor(cli, args);
  let stdout;
  try {
    ({ stdout } = await execFileAsync(cli.command, commandArgs, {
      cwd,
      env: process.env,
      maxBuffer: 1024 * 1024,
    }));
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new ProvisioningError(
        "missing_cli",
        "Hellyeah CLI not found. Install hellyeah or pass --hellyeah-bin /path/to/hellyeah.",
        { command, exitCode: 127 }
      );
    }
    throw new ProvisioningError(
      "cli_version_check_failed",
      "Could not determine the Hellyeah CLI version. Run `hellyeah update` and retry.",
      { command, exitCode: err?.exitCode ?? err?.code }
    );
  }

  const version = stdout.trim();
  if (compareVersions(version, minimumCliVersion) < 0) {
    throw new ProvisioningError(
      "cli_too_old",
      `Hellyeah CLI ${version || "unknown"} is too old for tracker state/create. Run hellyeah update and retry.`,
      { command, minimumCliVersion, version }
    );
  }
  return version;
};

const runCliJson = async (cli, cwd, args) => {
  const commandArgs = [...cli.args, ...args];
  const command = commandTextFor(cli, args);
  try {
    const { stdout } = await execFileAsync(cli.command, commandArgs, {
      cwd,
      env: process.env,
      maxBuffer: 1024 * 1024 * 16,
    });
    return { command, envelope: parseEnvelope(stdout, command) };
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new ProvisioningError(
        "missing_cli",
        "Hellyeah CLI not found. Install hellyeah or pass --hellyeah-bin /path/to/hellyeah.",
        { command, exitCode: 127 }
      );
    }
    if (err?.stdout) {
      const exitCode = err.exitCode ?? err.code;
      const envelope = parseEnvelope(err.stdout, command, exitCode);
      throwEnvelopeError(
        envelope,
        "tracker_provision_failed",
        `${command} failed`,
        { command, exitCode }
      );
    }
    throw new ProvisioningError(
      "tracker_provision_failed",
      `${command} failed`,
      { command, exitCode: err?.exitCode ?? err?.code }
    );
  }
};

const extractTrackerReferenceId = (envelope) =>
  envelope?.data?.tracker?.trackerId ?? envelope?.data?.trackerId;

const extractCreatedTrackerId = (envelope) => {
  const trackerId = extractTrackerReferenceId(envelope);
  if (!(envelope?.success === true && UUID_RE.test(trackerId ?? ""))) {
    throwEnvelopeError(
      envelope,
      "invalid_cli_response",
      "hellyeah tracker create did not return data.trackerId"
    );
  }
  return trackerId;
};

const extractStateTrackerId = (envelope) => {
  const code = envelope?.data?.code;
  const tracker = envelope?.data?.tracker ?? null;
  if (envelope?.success === true && code === "no_tracker" && tracker === null)
    return null;
  const trackerId = extractTrackerReferenceId(envelope);
  if (!(envelope?.success === true && UUID_RE.test(trackerId ?? ""))) {
    throwEnvelopeError(
      envelope,
      "invalid_cli_response",
      "hellyeah tracker state did not return data.tracker.trackerId"
    );
  }
  return trackerId;
};

const stateArgs = (flags) => {
  const args = ["tracker", "state", "--json"];
  if (flags.org && flags.org !== true) args.push("--org", String(flags.org));
  if (flags["api-key"] && flags["api-key"] !== true)
    args.push("--api-key", String(flags["api-key"]));
  return args;
};

export const createArgs = (resolution, flags = {}) => {
  const args = ["tracker", "create"];
  switch (resolution.mode) {
    case "production":
      args.push("--domain", resolution.primary);
      break;
    case "pre-launch":
      args.push("--pre-launch");
      break;
    default:
      throw new Error(`Unknown tracker provisioning mode: ${resolution.mode}`);
  }
  args.push("--json", "--yes");
  if (flags.org && flags.org !== true) args.push("--org", String(flags.org));
  if (flags.name && flags.name !== true)
    args.push("--name", String(flags.name));
  if (flags["api-key"] && flags["api-key"] !== true)
    args.push("--api-key", String(flags["api-key"]));
  return args;
};

export const resolveTrackerFromCli = async (cwd, flags = {}) => {
  const cli = resolveHellyeahCli(flags);
  const version = await assertMinimumCliVersion(cli, cwd);
  const state = await runCliJson(cli, cwd, stateArgs(flags));
  const trackerId = extractStateTrackerId(state.envelope);
  if (trackerId !== null) {
    return {
      cli: cli.display,
      cliVersion: version,
      envelope: state.envelope,
      stateCommand: state.command,
      trackerId,
      trackerIdSource: "state",
    };
  }

  const created = await provisionTracker(cwd, flags, { cli, version });
  return {
    ...created,
    stateCommand: state.command,
  };
};

export const resolveTrackerStateFromCli = async (cwd, flags = {}) => {
  const cli = resolveHellyeahCli(flags);
  const version = await assertMinimumCliVersion(cli, cwd);
  const state = await runCliJson(cli, cwd, stateArgs(flags));
  const trackerId = extractStateTrackerId(state.envelope);
  return {
    cli: cli.display,
    cliVersion: version,
    envelope: state.envelope,
    stateCommand: state.command,
    trackerId,
    trackerIdSource: "state",
  };
};

export const provisionTracker = async (cwd, flags = {}, options = {}) => {
  const resolution = resolveProductionDomains(flags);
  const cli = options.cli ?? resolveHellyeahCli(flags);
  const version = options.version ?? (await assertMinimumCliVersion(cli, cwd));
  const args = createArgs(resolution, flags);
  const result = await runCliJson(cli, cwd, args);
  const trackerId = extractCreatedTrackerId(result.envelope);
  return {
    cli: cli.display,
    cliVersion: version,
    command: result.command,
    provisioning:
      resolution.mode === "production"
        ? { domain: resolution.primary }
        : { mode: "pre-launch" },
    envelope: result.envelope,
    trackerId,
    trackerIdSource: "create",
  };
};
