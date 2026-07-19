import {
  isInsideRoot,
  normalizeSiteForRoot,
  resolveSitePath,
} from "./paths.mjs";
import { repair } from "./repairs.mjs";
import { findCalls } from "./sources.mjs";
import { indexCatalogConversionCallsByRoot } from "./state-index.mjs";
import { hasPath, readText } from "./utils.mjs";

const IDENTITY_BRIDGE_EVENTS = new Set([
  "cv.bookAppointment",
  "cv.contact",
  "cv.leadSubmit",
  "cv.purchase",
  "cv.registrationComplete",
  "cv.startTrial",
  "cv.submitApplication",
  "cv.subscribe",
]);

const EMAIL_ARG_RE = /\bemail\b/;

const needsIdentityBridge = (event) => IDENTITY_BRIDGE_EVENTS.has(event);

const callSite = (call) =>
  call.line === null || call.line === undefined
    ? call.path
    : `${call.path}:${call.line}`;

const makeClaimIndex = (reports) => {
  const claims = [];
  for (const report of reports) {
    for (const finding of report.findings) {
      if (!needsIdentityBridge(finding.proposedEvent)) continue;
      const site = normalizeSiteForRoot(report.root, finding.site);
      if (site === null) continue;
      claims.push({
        finding,
        line: site.line,
        root: report.root,
        sitePath: site.path,
      });
    }
  }
  return claims;
};

const findClaim = (call, claims) =>
  claims.find(
    (claim) =>
      claim.sitePath === call.path &&
      claim.finding.proposedEvent === call.expectedEvent &&
      claim.line === call.line
  ) ?? null;

const callHasJoinKey = (call, key) => {
  switch (key) {
    case "distinctId":
      return call.hasDistinctId;
    case "identity":
      return call.hasIdentity;
    case "visitorId":
      return call.hasVisitorId;
    default:
      return false;
  }
};

const hasObjectKeyMarker = (siteContent, key) => {
  const re = new RegExp(`(?:^|[{,])\\s*["']?${key}["']?\\s*(?::|,|})`, "m");
  return re.test(siteContent);
};

const hasEmailIdentifyCall = (siteContent) =>
  findCalls(siteContent, ["identify"]).some((call) =>
    EMAIL_ARG_RE.test(call.argsBody)
  );

const MECHANISM_MARKERS = {
  browser_identify: (siteContent) => siteContent.includes("identify("),
  server_cookie_persist_cookie: (siteContent) =>
    siteContent.includes("hy_attr"),
  server_cookie_persist_conversion: (siteContent) =>
    hasObjectKeyMarker(siteContent, "visitorId"),

  visitor_id_passthrough: (siteContent) =>
    hasObjectKeyMarker(siteContent, "visitorId"),

  email_late_bind: hasEmailIdentifyCall,
};

const checkResolvedMarker = async ({ fullPath, markerKey }) => {
  const marker = MECHANISM_MARKERS[markerKey];
  if (!marker) {
    throw new Error(`Missing identity bridge marker for ${markerKey}`);
  }
  return marker(await readText(fullPath));
};

const checkSiteMarker = async ({
  root,
  roots,
  cwd,
  site,
  mechanism,
  markerKey,
  label,
}) => {
  const rootResolved = resolveSitePath(site, cwd, root.path);
  if (rootResolved.ok && (await hasPath(rootResolved.fullPath))) {
    if (
      await checkResolvedMarker({ fullPath: rootResolved.fullPath, markerKey })
    ) {
      return null;
    }
    return repair("identity_bridge_site_unresolved", {
      root: root.path,
      site,
      mechanism,
      message: `identityBridge site "${site}" for ${label} resolves inside root "${root.path}" but does not carry the ${markerKey} marker. Wire the bridge there or cite cross-root evidence as a cwd-relative path.`,
    });
  }

  const cwdResolved = resolveSitePath(site, cwd, ".");
  if (cwdResolved.ok && (await hasPath(cwdResolved.fullPath))) {
    const rootForSite = roots.find((candidate) =>
      isInsideRoot(cwdResolved.parsed.path, candidate.path)
    );
    if (rootForSite) {
      if (
        await checkResolvedMarker({ fullPath: cwdResolved.fullPath, markerKey })
      ) {
        return null;
      }
      return repair("identity_bridge_site_unresolved", {
        root: root.path,
        site,
        mechanism,
        message: `identityBridge site "${site}" for ${label} resolves as cwd-relative evidence but does not carry the ${markerKey} marker. Wire the bridge or correct the mechanism/site.`,
      });
    }
  }

  return repair("identity_bridge_site_unresolved", {
    root: root.path,
    site,
    mechanism,
    message: `identityBridge site "${site}" for ${label} does not resolve inside the conversion root "${root.path}" or as a cwd-relative file inside an enumerated root. Cite cross-root bridge evidence as a cwd-relative path, for example "apps/web/src/layout.tsx".`,
  });
};

const ok = () => ({ kind: "ok" });

const repairResult = (entry) => ({ kind: "repair", repair: entry });

const unstitchedResult = ({ event, message, root, site }) => ({
  kind: "unstitched",
  diagnostic: {
    code: "conversion_unstitched_from_entry",
    severity: "warn",
    root,
    site,
    expectedEvent: event,
    message,
  },
});

const unknownJoinKeyResult = ({
  event,
  key,
  label,
  mechanism,
  root,
  site,
}) => ({
  kind: "unknown",
  diagnostic: {
    code: "identity_bridge_join_key_unverifiable",
    severity: "warn",
    root,
    site,
    expectedEvent: event,
    message: `${label} declares ${mechanism}, but the conversion payload is not statically resolvable enough to prove ${key}. Confirm the payload carries ${key}; verify will not repair an unknown payload as absent.`,
  },
});

const missingJoinKeyResult = ({ key, label, mechanism, root, site }) =>
  repairResult(
    repair("identity_bridge_join_key_missing", {
      root: root.path,
      site,
      mechanism,
      message: `${label} declares ${mechanism} but the conversion call does not carry ${key}. Add ${key} to the server conversion or choose the mechanism that matches the source.`,
    })
  );

const checkMechanism = async ({ bridge, call, root, roots, cwd, label }) => {
  switch (bridge.mechanism) {
    case "browser_identify": {
      const hasDistinctId = callHasJoinKey(call, "distinctId");
      if (hasDistinctId === false) {
        return missingJoinKeyResult({
          key: "distinctId",
          label,
          mechanism: bridge.mechanism,
          root,
          site: bridge.site,
        });
      }
      {
        const siteRepair = await checkSiteMarker({
          root,
          roots,
          cwd,
          site: bridge.site,
          mechanism: bridge.mechanism,
          markerKey: "browser_identify",
          label,
        });
        if (siteRepair) return repairResult(siteRepair);
      }
      if (hasDistinctId === null) {
        return unknownJoinKeyResult({
          event: call.expectedEvent,
          key: "distinctId",
          label,
          mechanism: bridge.mechanism,
          root: root.path,
          site: bridge.site,
        });
      }
      return ok();
    }
    case "server_cookie_persist": {
      const hasVisitorId = callHasJoinKey(call, "visitorId");
      if (hasVisitorId === false) {
        return missingJoinKeyResult({
          key: "visitorId",
          label,
          mechanism: bridge.mechanism,
          root,
          site: bridge.conversionSite,
        });
      }
      for (const [site, markerKey] of [
        [bridge.cookieSite, "server_cookie_persist_cookie"],
        [bridge.conversionSite, "server_cookie_persist_conversion"],
      ]) {
        const siteRepair = await checkSiteMarker({
          root,
          roots,
          cwd,
          site,
          mechanism: bridge.mechanism,
          markerKey,
          label,
        });
        if (siteRepair) return repairResult(siteRepair);
      }
      if (hasVisitorId === null) {
        return unknownJoinKeyResult({
          event: call.expectedEvent,
          key: "visitorId",
          label,
          mechanism: bridge.mechanism,
          root: root.path,
          site: bridge.conversionSite,
        });
      }
      return ok();
    }
    case "visitor_id_passthrough": {
      const hasVisitorId = callHasJoinKey(call, "visitorId");
      if (hasVisitorId === false) {
        return missingJoinKeyResult({
          key: "visitorId",
          label,
          mechanism: bridge.mechanism,
          root,
          site: bridge.site,
        });
      }
      {
        const siteRepair = await checkSiteMarker({
          root,
          roots,
          cwd,
          site: bridge.site,
          mechanism: bridge.mechanism,
          markerKey: "visitor_id_passthrough",
          label,
        });
        if (siteRepair) return repairResult(siteRepair);
      }
      if (hasVisitorId === null) {
        return unknownJoinKeyResult({
          event: call.expectedEvent,
          key: "visitorId",
          label,
          mechanism: bridge.mechanism,
          root: root.path,
          site: bridge.site,
        });
      }
      return ok();
    }
    case "email_late_bind": {
      const hasIdentity = callHasJoinKey(call, "identity");
      if (hasIdentity === false) {
        return missingJoinKeyResult({
          key: "identity",
          label,
          mechanism: bridge.mechanism,
          root,
          site: bridge.site,
        });
      }
      const siteRepair = await checkSiteMarker({
        root,
        roots,
        cwd,
        site: bridge.site,
        mechanism: bridge.mechanism,
        markerKey: "email_late_bind",
        label,
      });
      if (siteRepair) return repairResult(siteRepair);
      if (hasIdentity === null) {
        return unknownJoinKeyResult({
          event: call.expectedEvent,
          key: "identity",
          label,
          mechanism: bridge.mechanism,
          root: root.path,
          site: bridge.site,
        });
      }
      const hasVisitorId = callHasJoinKey(call, "visitorId");
      const hasDistinctId = callHasJoinKey(call, "distinctId");
      if (hasVisitorId === true || hasDistinctId === true) return ok();
      if (hasVisitorId === null || hasDistinctId === null) {
        return unknownJoinKeyResult({
          event: call.expectedEvent,
          key: "visitorId or distinctId",
          label,
          mechanism: bridge.mechanism,
          root: root.path,
          site: bridge.site,
        });
      }
      return unstitchedResult({
        event: call.expectedEvent,
        root: root.path,
        site: bridge.site,
        message: `${label} uses email_late_bind with identity only. Email feeds Enhanced Conversions postbacks, not click-id attribution; pair it with visitor_id_passthrough or distinctId to stitch.`,
      });
    }
    default:
      return ok();
  }
};

export const checkIdentityBridges = async (state, roots, cwd) => {
  const repairs = [];
  const diagnostics = [];
  const conversionsByRoot = await indexCatalogConversionCallsByRoot(
    state,
    roots,
    cwd
  );

  let instrumented = 0;
  let stitched = 0;
  const unstitched = new Map();
  const claims = makeClaimIndex(state.discoveryReports);

  const addUnstitched = (event, site) => {
    const label = `${event} (${site})`;
    unstitched.set(label, label);
  };

  for (const [rootPath, conversionCalls] of conversionsByRoot.entries()) {
    const root = roots.find((r) => r.path === rootPath) ?? { path: rootPath };
    for (const call of conversionCalls) {
      if (!needsIdentityBridge(call.expectedEvent)) continue;
      instrumented += 1;
      const claim = findClaim(call, claims);
      const site = callSite(call);
      const label = `${call.expectedEvent} at ${site}`;
      if (!claim) {
        repairs.push(
          repair("identity_bridge_missing", {
            root: root.path,
            site,
            event: call.expectedEvent,
            message: `Conversion ${label} has no matching identityBridge finding. Every server cv.* conversion must declare how browser identity reaches it, or mark it deferred with a justification.`,
          })
        );
        continue;
      }
      const { finding } = claim;
      const bridge = finding.identityBridge;
      if (!bridge) {
        repairs.push(
          repair("identity_bridge_missing", {
            root: root.path,
            site,
            event: call.expectedEvent,
            message: `Conversion ${label} has no identityBridge. Every server cv.* conversion must declare how browser identity reaches it, or mark it deferred with a justification.`,
          })
        );
        continue;
      }
      if (bridge.mechanism === "deferred") {
        addUnstitched(call.expectedEvent, site);
        diagnostics.push({
          code: "conversion_unstitched_from_entry",
          severity: "warn",
          root: root.path,
          site,
          expectedEvent: call.expectedEvent,
          message: `${label} has a deferred identity bridge: ${bridge.justification} This conversion will NOT attribute to ad clicks until the bridge is built.`,
        });
        continue;
      }
      const siteRepair = await checkMechanism({
        bridge,
        call,
        root,
        roots,
        cwd,
        label,
      });
      if (siteRepair.kind === "repair") {
        repairs.push(siteRepair.repair);
        continue;
      }
      if (siteRepair.kind === "unstitched") {
        addUnstitched(call.expectedEvent, site);
        diagnostics.push(siteRepair.diagnostic);
        continue;
      }
      if (siteRepair.kind === "unknown") {
        diagnostics.push(siteRepair.diagnostic);
      }
      stitched += 1;
    }
  }

  return {
    repairs,
    diagnostics,
    coverage: { instrumented, stitched, unstitched: [...unstitched.values()] },
  };
};

export const renderCoverageLine = (coverage) => {
  const base = `${coverage.instrumented} conversion(s) instrumented; ${coverage.stitched} stitched`;
  if (coverage.unstitched.length === 0) {
    return `${base}.`;
  }
  return `${base}; ${coverage.unstitched.join(", ")} will NOT attribute to ad clicks.`;
};
