import { findPiiRedFlags } from "./pii-redflags.mjs";
import { renderPiiRepair, repair } from "./repairs.mjs";
import { findMatchingBrace, skipStringOrComment } from "./utils.mjs";

const TRACKER_ENV_VALUE_RE = /^process\.env\.HELLYEAH_TRACKER_ENV\b/;
const TRACKER_ID_VALUE_RE =
  /^process\.env\.(?:NEXT_PUBLIC_HELLYEAH_TRACKER_ID|HELLYEAH_TRACKER_ID)\s*$/;
const IDENTIFIER_RE = /[A-Za-z0-9_$]/;
const IDENTIFIER_NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const STRING_LITERAL_RE = /^(['"`])([\s\S]*)\1$/;
const TRACK_CALL_PREFIX_RE = /\b(?:await|return|void|yield)\s*$/;
const WHITESPACE_RE = /\s/;

const SINGLETON_REPAIR_MESSAGES = {
  server_singleton_missing_tracker_id:
    "Singleton init must pass the tracker id as the first argument from process.env.NEXT_PUBLIC_HELLYEAH_TRACKER_ID or process.env.HELLYEAH_TRACKER_ID.",
  server_singleton_tracker_id_not_env_driven:
    "Singleton tracker id must read process.env.NEXT_PUBLIC_HELLYEAH_TRACKER_ID or process.env.HELLYEAH_TRACKER_ID directly. Hardcoded ids, constants, and helper wrappers can drift from verify-time provisioning.",
  server_singleton_env_missing:
    "Singleton must pass `env` from HELLYEAH_TRACKER_ENV so server events carry the tracker environment tag.",
  server_singleton_env_not_env_driven:
    "Singleton `env` must read HELLYEAH_TRACKER_ENV so server events carry the tracker environment tag.",
};

const isIdentifierChar = (ch) => Boolean(ch && IDENTIFIER_RE.test(ch));

const nextNonWhitespace = (content, start) => {
  let i = start;
  while (i < content.length) {
    const after = skipStringOrComment(content, i);
    if (after > i) {
      i = after;
      continue;
    }
    if (WHITESPACE_RE.test(content[i])) {
      i += 1;
      continue;
    }
    return i;
  }
  return -1;
};

const previousNonWhitespace = (content, start) => {
  let i = start;
  while (i >= 0 && WHITESPACE_RE.test(content[i])) {
    i -= 1;
  }
  return i;
};

const findMatchingParen = (content, openIdx) => {
  if (content[openIdx] !== "(") return -1;
  let depth = 0;
  let i = openIdx;
  while (i < content.length) {
    const after = skipStringOrComment(content, i);
    if (after > i) {
      i = after;
      continue;
    }
    const ch = content[i];
    switch (ch) {
      case "(":
        depth += 1;
        break;
      case ")":
        depth -= 1;
        if (depth === 0) return i;
        break;
      default:
        break;
    }
    i += 1;
  }
  return -1;
};

const isCallableNameAt = (content, index, name) => {
  if (!content.startsWith(name, index)) return false;
  return !(
    isIdentifierChar(content[index - 1]) ||
    isIdentifierChar(content[index + name.length])
  );
};

export const findCalls = (content, names) => {
  const calls = [];
  let i = 0;
  while (i < content.length) {
    const after = skipStringOrComment(content, i);
    if (after > i) {
      i = after;
      continue;
    }
    const name = names.find((candidate) =>
      isCallableNameAt(content, i, candidate)
    );
    if (!name) {
      i += 1;
      continue;
    }
    const parenIdx = nextNonWhitespace(content, i + name.length);
    if (parenIdx !== -1 && content[parenIdx] === "(") {
      const closeIdx = findMatchingParen(content, parenIdx);
      if (closeIdx !== -1) {
        calls.push({
          argsBody: content.slice(parenIdx + 1, closeIdx),
          closeIdx,
          name,
          nameIdx: i,
          openIdx: parenIdx,
        });
        i = closeIdx + 1;
        continue;
      }
    }
    i += name.length;
  }
  return calls;
};

const splitTopLevelArgs = (body) => {
  const args = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let i = 0;
  while (i < body.length) {
    const after = skipStringOrComment(body, i);
    if (after > i) {
      i = after;
      continue;
    }
    const ch = body[i];
    switch (ch) {
      case "(":
        parenDepth += 1;
        break;
      case ")":
        parenDepth -= 1;
        break;
      case "[":
        bracketDepth += 1;
        break;
      case "]":
        bracketDepth -= 1;
        break;
      case "{":
        braceDepth += 1;
        break;
      case "}":
        braceDepth -= 1;
        break;
      case ",":
        if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
          args.push(body.slice(start, i).trim());
          start = i + 1;
        }
        break;
      default:
        break;
    }
    i += 1;
  }
  const tail = body.slice(start).trim();
  if (tail) args.push(tail);
  return args;
};

const isNewXRayCall = (content, call) => {
  if (call.name !== "XRay") return false;
  const beforeName = previousNonWhitespace(content, call.nameIdx - 1);
  if (beforeName < 0) return false;
  const maybeNewStart = beforeName - "new".length + 1;
  return (
    maybeNewStart >= 0 &&
    content.slice(maybeNewStart, beforeName + 1) === "new" &&
    !isIdentifierChar(content[maybeNewStart - 1])
  );
};

const secondArgObjectBody = (
  call,
  { rejectSpread = false, requireSoleObject = false } = {}
) => {
  const optionsArg = splitTopLevelArgs(call.argsBody)[1];
  if (!optionsArg) return null;
  const openIdx = nextNonWhitespace(optionsArg, 0);
  if (openIdx === -1 || optionsArg[openIdx] !== "{") return null;
  const closeIdx = findMatchingBrace(optionsArg, openIdx);
  if (closeIdx === -1) return null;
  if (requireSoleObject && nextNonWhitespace(optionsArg, closeIdx + 1) !== -1)
    return null;
  const body = optionsArg.slice(openIdx + 1, closeIdx);
  if (rejectSpread && body.includes("...")) return null;
  return body;
};

const findConstObjectBody = (content, identifier, beforeIdx) => {
  let i = 0;
  let closest = null;
  while (i < beforeIdx) {
    const after = skipStringOrComment(content, i);
    if (after > i) {
      i = after;
      continue;
    }
    if (!isCallableNameAt(content, i, "const")) {
      i += 1;
      continue;
    }
    const nameIdx = nextNonWhitespace(content, i + "const".length);
    if (
      nameIdx === -1 ||
      !content.startsWith(identifier, nameIdx) ||
      isIdentifierChar(content[nameIdx - 1]) ||
      isIdentifierChar(content[nameIdx + identifier.length])
    ) {
      i += "const".length;
      continue;
    }
    let equalsIdx = nameIdx + identifier.length;
    while (equalsIdx < beforeIdx) {
      const next = skipStringOrComment(content, equalsIdx);
      if (next > equalsIdx) {
        equalsIdx = next;
        continue;
      }
      const ch = content[equalsIdx];
      if (ch === "=") break;
      if (ch === ";" || ch === "," || ch === "\n") {
        equalsIdx = -1;
        break;
      }
      equalsIdx += 1;
    }
    if (equalsIdx < 0 || equalsIdx >= beforeIdx || content[equalsIdx] !== "=") {
      i += "const".length;
      continue;
    }
    const openIdx = nextNonWhitespace(content, equalsIdx + 1);
    if (openIdx !== -1 && content[openIdx] === "{") {
      const closeIdx = findMatchingBrace(content, openIdx);
      if (closeIdx !== -1) {
        closest = content.slice(openIdx + 1, closeIdx);
        i = closeIdx + 1;
        continue;
      }
    }
    i += "const".length;
  }
  return closest;
};

const findOptionsBodyForCall = (call) =>
  secondArgObjectBody(call, { requireSoleObject: true });

const auditTrackerIdArg = (call) => {
  const [trackerIdArg] = splitTopLevelArgs(call.argsBody);
  if (!trackerIdArg) return ["server_singleton_missing_tracker_id"];
  if (!TRACKER_ID_VALUE_RE.test(trackerIdArg.trim()))
    return ["server_singleton_tracker_id_not_env_driven"];
  return [];
};

const findPropertyValue = (optionsBody, propertyName) => {
  const propertyRe = new RegExp(`^\\s*${propertyName}\\s*:`);
  for (const property of splitTopLevelArgs(optionsBody)) {
    const match = property.match(propertyRe);
    if (!match) continue;
    return property.slice(match[0].length).trim();
  }
  return null;
};

const auditOptionsBody = (optionsBody) => {
  if (optionsBody === null) return ["server_singleton_env_missing"];
  const envValue = findPropertyValue(optionsBody, "env");
  const issues = [];
  if (envValue === null) {
    issues.push("server_singleton_env_missing");
  } else if (!TRACKER_ENV_VALUE_RE.test(envValue)) {
    issues.push("server_singleton_env_not_env_driven");
  }
  return issues;
};

const checkServerSingleton = (filePath, content) => {
  const calls = findCalls(content, ["createXRay", "XRay"]).filter(
    (call) => call.name === "createXRay" || isNewXRayCall(content, call)
  );
  if (calls.length === 0) {
    return [
      repair("server_singleton_missing_init", {
        file: filePath,
        message: "Expected createXRay(...) or new XRay(...) call in this file.",
      }),
    ];
  }
  const codes = new Set(
    calls.flatMap((call) =>
      auditTrackerIdArg(call).concat(
        auditOptionsBody(findOptionsBodyForCall(call))
      )
    )
  );
  return [...codes].map((code) =>
    repair(code, { file: filePath, message: SINGLETON_REPAIR_MESSAGES[code] })
  );
};

const isTrackCall = (content, call) => {
  if (call.name !== "track" && call.name !== "trackImmediate") return false;
  const beforeName = previousNonWhitespace(content, call.nameIdx - 1);
  if (beforeName === -1) return true;
  if (content[beforeName] === "." || !isIdentifierChar(content[beforeName]))
    return true;
  return TRACK_CALL_PREFIX_RE.test(content.slice(0, call.nameIdx));
};

const lineNumberAt = (content, offset) =>
  content.slice(0, offset).split("\n").length;

const literalStringValue = (arg) => {
  const trimmed = arg.trim();
  const match = trimmed.match(STRING_LITERAL_RE);
  if (!match) return null;
  if (match[1] === "`" && trimmed.includes("${")) return null;
  return match[2];
};

export const eventArgMatches = (eventArg, expectedEvent) => {
  const trimmed = eventArg.trim();
  if (expectedEvent.startsWith("cv.")) return trimmed === expectedEvent;
  return literalStringValue(trimmed) === expectedEvent;
};

const trackCalls = (content) =>
  findCalls(content, ["trackImmediate", "track"]).filter((call) =>
    isTrackCall(content, call)
  );

const findTrackedEvents = (content) =>
  trackCalls(content)
    .map((call) => splitTopLevelArgs(call.argsBody)[0])
    .filter(Boolean);

const checkConversionEvent = (filePath, content, expectedEvents) => {
  const repairs = [];
  const trackedEvents = findTrackedEvents(content);
  for (const event of expectedEvents) {
    if (!trackedEvents.some((eventArg) => eventArgMatches(eventArg, event))) {
      repairs.push(
        repair("conversion_event_missing", {
          file: filePath,
          event,
          message: `Expected ${event} call site not found in ${filePath}.`,
        })
      );
    }
  }
  return repairs;
};

const REQUIRED_PAYLOAD_FIELDS = {
  "cv.purchase": ["revenue", "currency", "identity", "distinctId"],
  "cv.subscribe": ["revenue", "currency", "identity", "distinctId"],
  "cv.registrationComplete": ["identity", "distinctId"],
};

const findPayloadBodyForCall = (call) =>
  secondArgObjectBody(call, { rejectSpread: true });

const PAYLOAD_KEY_RES = new Map(
  [...new Set(Object.values(REQUIRED_PAYLOAD_FIELDS).flat())].map((key) => [
    key,
    new RegExp(`^\\s*["']?${key}["']?\\s*(?::|,|$)`),
  ])
);

const payloadKeyRe = (key) => {
  if (!PAYLOAD_KEY_RES.has(key)) {
    PAYLOAD_KEY_RES.set(key, new RegExp(`^\\s*["']?${key}["']?\\s*(?::|,|$)`));
  }
  return PAYLOAD_KEY_RES.get(key);
};

const stripComments = (property) =>
  property.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").trim();

const propertiesHaveKey = (properties, key) =>
  properties.some((property) =>
    payloadKeyRe(key).test(stripComments(property))
  );

const checkPayloadFields = (filePath, content, expectedEvents) => {
  const diagnostics = [];
  const targets = expectedEvents.filter((event) =>
    Object.hasOwn(REQUIRED_PAYLOAD_FIELDS, event)
  );
  if (targets.length === 0) return diagnostics;
  const calls = trackCalls(content);
  for (const event of targets) {
    for (const call of calls) {
      const [eventArg] = splitTopLevelArgs(call.argsBody);
      if (!(eventArg && eventArgMatches(eventArg, event))) continue;
      const body = findPayloadBodyForCall(call);
      if (body === null) continue;
      const properties = splitTopLevelArgs(body);
      const missing = REQUIRED_PAYLOAD_FIELDS[event].filter(
        (key) => !propertiesHaveKey(properties, key)
      );
      if (missing.length > 0) {
        diagnostics.push({
          code: "payload_required_field_absent",
          severity: "warn",
          site: filePath,
          expectedEvent: event,
          message: `${event} call in ${filePath} appears to omit required payload field(s): ${missing.join(", ")}. Ad platforms need these for match quality. Advisory — add them if statically present elsewhere.`,
        });
      }
    }
  }
  return diagnostics;
};

export const collectFileDiagnostics = (entry, content) => {
  if (entry.kind !== "conversion_event") return [];
  return checkPayloadFields(entry.path, content, entry.expectedEvents ?? []);
};

const payloadBodyForJoinKeyCheck = (content, call) => {
  const args = splitTopLevelArgs(call.argsBody);
  const optionsArg = args[1];
  if (!optionsArg) return { kind: "absent" };

  const body = secondArgObjectBody(call, { requireSoleObject: false });
  if (body !== null) return { body, kind: "known" };

  const trimmed = optionsArg.trim();
  if (!IDENTIFIER_NAME_RE.test(trimmed)) return { kind: "unknown" };

  const resolvedBody = findConstObjectBody(content, trimmed, call.nameIdx);
  if (resolvedBody === null) return { kind: "unknown" };
  return { body: resolvedBody, kind: "known" };
};

const payloadCarriesKey = (content, call, key) => {
  const payload = payloadBodyForJoinKeyCheck(content, call);
  if (payload.kind === "absent") return false;
  if (payload.kind === "unknown") return null;

  const properties = splitTopLevelArgs(payload.body);
  if (propertiesHaveKey(properties, key)) return true;
  return payload.body.includes("...") ? null : false;
};

export const conversionTrackCalls = (content) =>
  trackCalls(content)
    .map((call) => {
      const [eventArg] = splitTopLevelArgs(call.argsBody);
      if (!eventArg) return null;
      const trimmed = eventArg.trim();
      const literal = literalStringValue(trimmed);
      return {
        event: trimmed,
        eventValue: literal === null ? trimmed : literal,
        hasDistinctId: payloadCarriesKey(content, call, "distinctId"),
        hasIdentity: payloadCarriesKey(content, call, "identity"),
        hasVisitorId: payloadCarriesKey(content, call, "visitorId"),
        line: lineNumberAt(content, call.nameIdx),
      };
    })
    .filter(Boolean);

const MODULE_SPECIFIER_RE =
  /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export const moduleSpecifiers = (content) => {
  const specs = [];
  let match = MODULE_SPECIFIER_RE.exec(content);
  while (match !== null) {
    specs.push(match[1] ?? match[2]);
    match = MODULE_SPECIFIER_RE.exec(content);
  }
  return specs;
};

export const referencesServerSdk = (content) =>
  moduleSpecifiers(content).includes("@hellyeah/x-ray/server");

export const checkApprovedFile = (entry, content) => {
  const repairs = [];
  switch (entry.kind) {
    case "server_singleton":
      repairs.push(...checkServerSingleton(entry.path, content));
      break;
    case "conversion_event":
      repairs.push(
        ...checkConversionEvent(entry.path, content, entry.expectedEvents)
      );
      break;
    default:
      break;
  }
  if (entry.kind !== "provider_mount") {
    for (const flag of findPiiRedFlags(entry.path, content)) {
      repairs.push(renderPiiRepair(flag));
    }
  }
  return repairs;
};
