import path from "node:path";
import {
  resolveProvidedTrackerId,
  resolveTrackerAuthority,
} from "./authority.mjs";
import { DEFAULT_INSTALL_STATE_PATH } from "./constants.mjs";
import { checkDiscoveryReports } from "./discovery.mjs";
import { writeTrackerEnvFiles } from "./env-state.mjs";
import {
  checkIdentityBridges,
  renderCoverageLine,
} from "./identity-bridge.mjs";
import { resolveCwdPath } from "./paths.mjs";
import { repair } from "./repairs.mjs";
import { enumerateRoots } from "./roots.mjs";
import { checkApprovedFile, collectFileDiagnostics } from "./sources.mjs";
import { findBannedReasonSubstring, validateState } from "./state.mjs";
import { summarizeDiscovery } from "./state-index.mjs";
import { hasPath, readJson, readText, writeJsonAtomic } from "./utils.mjs";

const auditApprovedFile = async (entry, cwd) => {
  const resolved = resolveCwdPath(cwd, entry.path);
  if (!resolved.ok) {
    return {
      repairs: [
        repair("approved_file_outside_cwd", {
          file: entry.path,
          message: `Approved file ${entry.path} resolves outside --cwd. Refused for safety.`,
        }),
      ],
      diagnostics: [],
    };
  }
  if (!(await hasPath(resolved.fullPath))) {
    return {
      repairs: [
        repair("approved_file_missing", {
          file: entry.path,
          message: `Approved file not found at ${entry.path}.`,
        }),
      ],
      diagnostics: [],
    };
  }
  const content = await readText(resolved.fullPath);
  return {
    repairs: checkApprovedFile(entry, content),
    diagnostics: collectFileDiagnostics(entry, content),
  };
};

const summarizeState = (state, roots, repairs, coverage) => ({
  ...summarizeDiscovery(state),
  enumeratedRoots: roots.length,
  repairsCount: repairs.length,
  ...(coverage
    ? {
        attributionCoverage: {
          ...coverage,
          summary: renderCoverageLine(coverage),
        },
      }
    : {}),
});

const collectBannedReasonRepairs = (state) => {
  const repairs = [];
  for (const [i, report] of state.discoveryReports.entries()) {
    for (const [j, skipped] of report.skipped.entries()) {
      const phrase = findBannedReasonSubstring(skipped.reason);
      if (phrase) {
        repairs.push(
          repair("skipped_reason_lazy_rationale", {
            root: report.root,
            site: skipped.site,
            message: `discoveryReports[${i}].skipped[${j}].reason for "${skipped.site}" leans on a banned lazy rationale ("${phrase}"). Skipping a real conversion site because "one event is enough" or it "would broaden the install" starves the ad funnel — each stage is signal the optimizer needs. Either instrument the site or write a reason a reviewer can audit (what the site actually is, why it does not qualify).`,
          })
        );
      }
    }
  }
  return repairs;
};

const collectAudit = async (cwd, state) => {
  const repairs = [];
  const diagnostics = [];
  for (const entry of state.approvedFiles) {
    const result = await auditApprovedFile(entry, cwd);
    repairs.push(...result.repairs);
    diagnostics.push(...result.diagnostics);
  }

  const roots = await enumerateRoots(cwd);
  repairs.push(...(await checkDiscoveryReports(state, roots, cwd)));
  repairs.push(...collectBannedReasonRepairs(state));

  const bridge = await checkIdentityBridges(state, roots, cwd);
  repairs.push(...bridge.repairs);
  diagnostics.push(...bridge.diagnostics);

  return { repairs, diagnostics, roots, coverage: bridge.coverage };
};

const applyTrackerOverride = async (
  cwd,
  statePath,
  state,
  trackerId,
  audit
) => {
  state.trackerId = trackerId;
  await writeJsonAtomic(statePath, state);
  const envFiles = await writeTrackerEnvFiles(cwd, trackerId);
  return {
    success: true,
    trackerId,
    trackerIdSource: "override",
    envFiles,
    repairs: [],

    diagnostics: audit.diagnostics,
    summary: summarizeState(state, audit.roots, [], audit.coverage),
    verified: false,
    verificationSkipped: "ownership_override",
  };
};

export const verify = async (cwd, flags = {}) => {
  const statePath = path.join(cwd, DEFAULT_INSTALL_STATE_PATH);
  if (!(await hasPath(statePath))) {
    return {
      success: false,
      reason: "missing_install_state",
      message: `No ${DEFAULT_INSTALL_STATE_PATH} found. Author it per the SKILL.md template before running verify.`,
    };
  }
  let state;
  try {
    state = await readJson(statePath);
  } catch (err) {
    return {
      success: false,
      reason: "invalid_install_state_json",
      message: `Failed to parse ${DEFAULT_INSTALL_STATE_PATH}: ${err.message}. Delete the file and re-author from the SKILL.md template.`,
    };
  }
  try {
    validateState(state, { allowMissingTrackerId: true });
  } catch (err) {
    return {
      success: false,
      reason: "invalid_install_state_schema",
      message: err.message,
    };
  }

  const provided = resolveProvidedTrackerId(flags);
  if (!provided.ok) return provided.result;

  const { repairs, diagnostics, roots, coverage } = await collectAudit(
    cwd,
    state
  );
  if (repairs.length > 0) {
    return {
      success: false,
      trackerId: state.trackerId,
      repairs,
      diagnostics,
      summary: summarizeState(state, roots, repairs, coverage),
    };
  }

  if (provided.override !== null) {
    return await applyTrackerOverride(
      cwd,
      statePath,
      state,
      provided.trackerId,
      {
        diagnostics,
        roots,
        coverage,
      }
    );
  }

  const tracker = await resolveTrackerAuthority(cwd, flags, state, provided);
  if (!tracker.success) return tracker;
  if (state.trackerId !== tracker.trackerId) {
    state.trackerId = tracker.trackerId;
    await writeJsonAtomic(statePath, state);
  }
  const envFiles = await writeTrackerEnvFiles(cwd, tracker.trackerId);

  return {
    success: true,
    trackerId: state.trackerId,
    trackerIdSource: tracker.trackerIdSource,
    envFiles,
    verified: tracker.verified,
    ...(tracker.verificationSkipped
      ? { verificationSkipped: tracker.verificationSkipped }
      : {}),
    ...(tracker.provisioning ? { provisioning: tracker.provisioning } : {}),
    repairs,
    diagnostics,
    summary: summarizeState(state, roots, repairs, coverage),
  };
};
