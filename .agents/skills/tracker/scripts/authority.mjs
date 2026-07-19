import { UUID_RE } from "./constants.mjs";
import { detectTrackerIdConflicts } from "./env-state.mjs";
import {
  resolveTrackerFromCli,
  resolveTrackerStateFromCli,
} from "./provisioning.mjs";

const invalidStateTrackerId = () => ({
  message: "install-state.json: trackerId must be a UUID",
  reason: "invalid_install_state_schema",
  success: false,
});

const ownershipQuestion = (providedId, orgTrackerId) => ({
  options: ["No, abort", "Yes, use the id I provided"],
  question: `The tracker id you provided (${providedId}) isn't the one linked to your org (${orgTrackerId ?? "your org has no tracker"}). If you continue, your site will send analytics to that tracker and you won't see those events in your dashboard. Continue with the provided id?`,
});

const trackerOwnershipUnconfirmed = (providedId, orgTrackerId) => ({
  success: false,
  code: "tracker_ownership_unconfirmed",
  reason: "tracker_ownership_unconfirmed",
  providedId,
  orgTrackerId,
  question: ownershipQuestion(providedId, orgTrackerId),
  nextAction:
    "Ask the user to confirm; do not run any command until answered. On confirmation, re-run verify with --confirm-tracker-override.",
});

const orgSelectionRequired = (orgs) => ({
  success: false,
  code: "org_selection_required",
  reason: "multi_org_ambiguous",
  orgs,
  question: {
    options: orgs.map((org) => org.name ?? org.id),
    question: "Which org should own this tracker?",
  },
  nextAction:
    "Ask the user; do not run any command until answered. Re-run with --org <selected id>.",
});

const envOverwriteUnconfirmed = (oldId, newId, files) => ({
  success: false,
  code: "tracker_env_overwrite_unconfirmed",
  reason: "tracker_env_overwrite_unconfirmed",
  oldId,
  newId,
  files,
  question: {
    options: ["No, abort", "Yes, overwrite the existing tracker id"],
    question: `Your .env files already point at tracker ${oldId}, but this run resolved ${newId}. Overwriting repoints analytics to ${newId}; events under ${oldId} stay on the other tracker. Overwrite?`,
  },
  nextAction:
    "Ask the user to confirm; do not run any command until answered. On confirmation, re-run verify with --tracker-id <newId> --confirm-tracker-override <newId>.",
});

export const resolveProvidedTrackerId = (flags) => {
  const trackerId =
    flags["tracker-id"] && flags["tracker-id"] !== true
      ? String(flags["tracker-id"])
      : null;
  if (trackerId !== null && !UUID_RE.test(trackerId)) {
    return {
      ok: false,
      result: {
        success: false,
        reason: "invalid_tracker_id",
        message: "--tracker-id must be a UUID.",
        trackerId,
      },
    };
  }
  const override =
    flags["confirm-tracker-override"] &&
    flags["confirm-tracker-override"] !== true
      ? String(flags["confirm-tracker-override"])
      : null;
  if (override !== null && !UUID_RE.test(override)) {
    return {
      ok: false,
      result: {
        success: false,
        reason: "invalid_tracker_override",
        message: "--confirm-tracker-override must be a UUID.",
        trackerId: override,
      },
    };
  }
  if (override !== null && override !== trackerId) {
    return {
      ok: false,
      result: {
        success: false,
        reason: "tracker_override_mismatch",
        message:
          "--confirm-tracker-override must equal the --tracker-id value from the confirmation prompt.",
        trackerId,
        override,
      },
    };
  }
  return { ok: true, override, trackerId };
};

export const resolveTrackerAuthority = async (cwd, flags, state, provided) => {
  if (state.trackerId !== null && !UUID_RE.test(state.trackerId ?? ""))
    return invalidStateTrackerId();

  let resolved;
  try {
    resolved =
      provided.trackerId === null
        ? await resolveTrackerFromCli(cwd, flags)
        : await resolveTrackerStateFromCli(cwd, flags);
  } catch (err) {
    if (err?.reason === "multi_org_ambiguous")
      return orgSelectionRequired(err.orgs ?? []);
    return {
      success: false,
      reason: err?.reason ?? "tracker_provision_failed",
      message: err?.message ?? String(err),
      ...(err?.command ? { command: err.command } : {}),
      ...(err?.exitCode ? { exitCode: err.exitCode } : {}),
      ...(err?.nextAction ? { nextAction: err.nextAction } : {}),
      ...(err?.existing ? { existing: err.existing } : {}),
      ...(err?.orgs ? { orgs: err.orgs } : {}),
    };
  }

  if (provided.trackerId !== null && resolved.trackerId === null)
    return trackerOwnershipUnconfirmed(provided.trackerId, null);

  if (
    provided.trackerId !== null &&
    provided.trackerId !== resolved.trackerId
  ) {
    return trackerOwnershipUnconfirmed(provided.trackerId, resolved.trackerId);
  }

  const trackerId = provided.trackerId ?? resolved.trackerId;
  const conflicts = await detectTrackerIdConflicts(cwd, trackerId);
  if (conflicts.length > 0) {
    return envOverwriteUnconfirmed(conflicts[0].oldValue, trackerId, [
      ...new Set(conflicts.map((conflict) => conflict.file)),
    ]);
  }

  return {
    provisioning:
      resolved.trackerIdSource === "create" ? resolved.provisioning : null,
    success: true,
    trackerId,
    trackerIdSource:
      provided.trackerId === null ? resolved.trackerIdSource : "provided",
    verified: true,
  };
};
