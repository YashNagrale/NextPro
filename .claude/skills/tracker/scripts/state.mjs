import { UUID_RE } from "./constants.mjs";
import { INSTALL_STATE_VERSION } from "./workflow.mjs";

export const STATE_VERSION = INSTALL_STATE_VERSION;

const VALID_KINDS = new Set([
  "server_singleton",
  "conversion_event",
  "provider_mount",
]);

const CV_WIRE_FORMAT_RE = /^cv_[a-z_]+$/;
const RATIONALE_MIN_LENGTH = 40;
const EVIDENCE_MIN_LENGTH = 20;
const JUSTIFICATION_MIN_LENGTH = 20;

export const IDENTITY_BRIDGE_MECHANISMS = new Set([
  "browser_identify",
  "server_cookie_persist",
  "visitor_id_passthrough",
  "email_late_bind",
  "deferred",
]);

const PLACEHOLDER_REASONS = new Set([
  "",
  "n/a",
  "na",
  "no",
  "no conversions",
  "none",
  "skip",
  "tbd",
  "todo",
]);

const BANNED_REASON_SUBSTRINGS = [
  "one safe real conversion",
  "only needed one",
  "the safest real conversion",
  "broaden the install beyond",
  "purchase event is enough",
  "optional and would broaden",
];

const requireString = (value, label) => {
  if (typeof value !== "string" || !value) {
    throw new Error(`install-state.json: ${label} must be a non-empty string`);
  }
};

const requireArray = (value, label) => {
  if (!Array.isArray(value)) {
    throw new Error(`install-state.json: ${label} must be an array`);
  }
};

const validateIdentityBridge = (bridge, label) => {
  if (!bridge || typeof bridge !== "object") {
    throw new Error(`install-state.json: ${label} must be an object`);
  }
  if (!IDENTITY_BRIDGE_MECHANISMS.has(bridge.mechanism)) {
    throw new Error(
      `install-state.json: ${label}.mechanism must be one of ${[...IDENTITY_BRIDGE_MECHANISMS].join(", ")}`
    );
  }
  if (bridge.mechanism === "deferred") {
    requireString(bridge?.justification, `${label}.justification`);
    if (bridge.justification.trim().length < JUSTIFICATION_MIN_LENGTH) {
      throw new Error(
        `install-state.json: ${label}.justification must be at least ${JUSTIFICATION_MIN_LENGTH} characters. A deferred bridge means this conversion will NOT attribute to ad clicks — say which surface owns the unbuilt bridge and why it is out of scope now.`
      );
    }
    return;
  }
  if (bridge.mechanism === "server_cookie_persist") {
    requireString(bridge?.cookieSite, `${label}.cookieSite`);
    requireString(bridge?.conversionSite, `${label}.conversionSite`);
    return;
  }
  requireString(bridge?.site, `${label}.site`);
};

const validateFinding = (finding, label) => {
  requireString(finding?.site, `${label}.site`);
  requireString(finding?.kind, `${label}.kind`);
  requireString(finding?.proposedEvent, `${label}.proposedEvent`);
  if (CV_WIRE_FORMAT_RE.test(finding.proposedEvent)) {
    throw new Error(
      `install-state.json: ${label}.proposedEvent "${finding.proposedEvent}" uses wire format. Use the catalog identifier (cv.purchase, cv.startTrial, etc.), not the wire-format "cv_purchase" string.`
    );
  }
  requireString(finding?.rationale, `${label}.rationale`);
  if (finding.rationale.trim().length < RATIONALE_MIN_LENGTH) {
    throw new Error(
      `install-state.json: ${label}.rationale must be at least ${RATIONALE_MIN_LENGTH} characters. Explain why ${finding.proposedEvent} is the right event for this site — what the user is doing, why it matches the catalog meaning. A short label is not a rationale.`
    );
  }
  requireString(finding?.evidence, `${label}.evidence`);
  if (finding.evidence.trim().length < EVIDENCE_MIN_LENGTH) {
    throw new Error(
      `install-state.json: ${label}.evidence must be at least ${EVIDENCE_MIN_LENGTH} characters. Paste literal source from ${finding.site} that proves this is the conversion site.`
    );
  }
  if (finding.identityBridge !== undefined) {
    validateIdentityBridge(finding.identityBridge, `${label}.identityBridge`);
  }
};

const validateReason = (entry, label, message) => {
  requireString(entry?.reason, `${label}.reason`);
  if (PLACEHOLDER_REASONS.has(entry.reason.trim().toLowerCase())) {
    throw new Error(
      `install-state.json: ${label}.reason "${entry.reason}" is a placeholder. ${message}`
    );
  }
};

const validateSkipped = (entry, label) => {
  requireString(entry?.site, `${label}.site`);
  validateReason(
    entry,
    label,
    "Write a sentence specific enough that a reviewer reading the diff can audit the decision."
  );
};

const validateBlocked = (entry, label) => {
  requireString(entry?.site, `${label}.site`);
  requireArray(entry?.searched, `${label}.searched`);
  if (entry.searched.length === 0) {
    throw new Error(
      `install-state.json: ${label}.searched must list at least one query, file, or type path you tried before declaring this site blocked. An empty array is a guess in disguise.`
    );
  }
  for (const [k, query] of entry.searched.entries()) {
    requireString(query, `${label}.searched[${k}]`);
  }
  validateReason(
    entry,
    label,
    "Explain in a sentence what was uncertain — which candidate looked plausible, what type or source you couldn't confirm, why a guess would be unsafe."
  );
};

const validateApprovedFiles = (state) => {
  requireArray(state.approvedFiles, "approvedFiles");
  if (state.approvedFiles.length === 0) {
    throw new Error(
      "install-state.json: approvedFiles must declare at least one file (a server_singleton, provider_mount, or conversion_event). An empty list verifies as success and hides incomplete installs."
    );
  }
  for (const [i, entry] of state.approvedFiles.entries()) {
    requireString(entry?.path, `approvedFiles[${i}].path`);
    if (!VALID_KINDS.has(entry.kind)) {
      throw new Error(
        `install-state.json: approvedFiles[${i}].kind must be one of ${[...VALID_KINDS].join(", ")}`
      );
    }
    requireArray(entry.expectedEvents, `approvedFiles[${i}].expectedEvents`);
    for (const [j, event] of entry.expectedEvents.entries()) {
      requireString(event, `approvedFiles[${i}].expectedEvents[${j}]`);
      if (CV_WIRE_FORMAT_RE.test(event)) {
        throw new Error(
          `install-state.json: approvedFiles[${i}].expectedEvents[${j}] "${event}" uses wire format. Catalog events must be referenced as cv.X (e.g., "cv.purchase") so source uses the typed constant from @hellyeah/x-ray, not the raw "cv_purchase" string literal.`
        );
      }
    }
  }
};

const validateDiscoveryReports = (state) => {
  requireArray(state.discoveryReports, "discoveryReports");
  for (const [i, report] of state.discoveryReports.entries()) {
    requireString(report?.root, `discoveryReports[${i}].root`);
    requireArray(report.filesRead, `discoveryReports[${i}].filesRead`);
    for (const [j, file] of report.filesRead.entries()) {
      requireString(file, `discoveryReports[${i}].filesRead[${j}]`);
    }
    requireArray(report.findings, `discoveryReports[${i}].findings`);
    for (const [j, finding] of report.findings.entries()) {
      validateFinding(finding, `discoveryReports[${i}].findings[${j}]`);
    }
    requireArray(report.skipped, `discoveryReports[${i}].skipped`);
    for (const [j, skipped] of report.skipped.entries()) {
      validateSkipped(skipped, `discoveryReports[${i}].skipped[${j}]`);
    }
    if (report.blocked !== undefined) {
      requireArray(report.blocked, `discoveryReports[${i}].blocked`);
      for (const [j, blocked] of report.blocked.entries()) {
        validateBlocked(blocked, `discoveryReports[${i}].blocked[${j}]`);
      }
    }
  }
};

export const findBannedReasonSubstring = (reason) => {
  if (typeof reason !== "string") return null;
  const lowered = reason.toLowerCase();
  return (
    BANNED_REASON_SUBSTRINGS.find((phrase) => lowered.includes(phrase)) ?? null
  );
};

export const validateState = (state, options = {}) => {
  if (!state || typeof state !== "object")
    throw new Error("install-state.json: expected an object");
  if (state.version !== STATE_VERSION) {
    throw new Error(
      `install-state.json: version must be ${STATE_VERSION}, got ${state.version}`
    );
  }
  if (
    !(
      UUID_RE.test(state.trackerId ?? "") ||
      (options.allowMissingTrackerId && state.trackerId === null)
    )
  ) {
    throw new Error("install-state.json: trackerId must be a UUID");
  }
  validateApprovedFiles(state);
  validateDiscoveryReports(state);
};
