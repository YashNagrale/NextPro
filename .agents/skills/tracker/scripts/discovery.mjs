import path from "node:path";
import { SOURCE_EXTENSIONS } from "./constants.mjs";
import {
  normalizeSiteForRoot,
  renderSiteReference,
  resolveRootPath,
  validateSite,
} from "./paths.mjs";
import { repair } from "./repairs.mjs";
import {
  indexConversionFilesByRoot,
  indexReportsByRoot,
} from "./state-index.mjs";
import { hasPath, readText } from "./utils.mjs";

const checkFilesRead = async (report, root, cwd) => {
  const repairs = [];
  let sourceFilesReadCount = 0;
  for (const file of report.filesRead) {
    const resolved = resolveRootPath(cwd, root.path, file);
    if (!resolved.ok && resolved.reason === "outside_root") {
      repairs.push(
        repair("discovery_files_read_outside_root", {
          root: root.path,
          file,
          message: `discoveryReports[${root.path}].filesRead "${file}" escapes root "${root.path}". Paths are root-relative.`,
        })
      );
      continue;
    }
    if (!resolved.ok) {
      repairs.push(
        repair("discovery_files_read_outside_cwd", {
          root: root.path,
          file,
          message: `discoveryReports[${root.path}].filesRead "${file}" resolves outside --cwd. Refused for safety.`,
        })
      );
      continue;
    }
    if (!(await hasPath(resolved.fullPath))) {
      repairs.push(
        repair("discovery_files_read_invalid", {
          root: root.path,
          file,
          message: `discoveryReports[${root.path}].filesRead path "${file}" does not exist on disk.`,
        })
      );
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()))
      sourceFilesReadCount += 1;
  }
  if (root.sourceFiles.length > 0 && sourceFilesReadCount === 0) {
    repairs.push(
      repair("discovery_files_read_too_thin", {
        root: root.path,
        message: `Root "${root.path}" has ${root.sourceFiles.length} source file(s) but discoveryReports[].filesRead lists none of them. Read at least one source file before reaching conclusions about this root.`,
      })
    );
  }
  return repairs;
};

const checkEvidence = async (finding, resolved, rootPath) => {
  if (!(resolved.ok && (await hasPath(resolved.fullPath)))) return null;
  const content = await readText(resolved.fullPath);
  const evidenceLines = finding.evidence
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const missing = evidenceLines.filter((line) => !content.includes(line));
  if (missing.length === 0) return null;
  const truncate = (line) =>
    line.length > 60 ? `${line.slice(0, 60)}…` : line;
  const sample = missing
    .slice(0, 2)
    .map((l) => `"${truncate(l)}"`)
    .join(", ");
  const tail = missing.length > 2 ? `, +${missing.length - 2} more` : "";
  return repair("discovery_evidence_not_in_source", {
    root: rootPath,
    site: finding.site,
    message: `findings[].evidence has ${missing.length} line(s) that don't appear in ${resolved.parsed.path}: ${sample}${tail}. Paste literal source from the file you cite — don't paraphrase.`,
  });
};

const validateFindingSite = async (rawSite, cwd, root) => {
  const site = normalizeSiteForRoot(root.path, rawSite);
  if (site === null) {
    return await validateSite(rawSite, cwd, root.path, false);
  }
  return await validateSite(renderSiteReference(site), cwd, ".", false);
};

const checkSites = async (report, root, cwd) => {
  const repairs = [];
  for (const finding of report.findings) {
    const result = await validateFindingSite(finding.site, cwd, root);
    if (!result.ok) {
      repairs.push(
        repair(result.code, {
          root: root.path,
          site: finding.site,
          message: `findings[] ${result.message}`,
        })
      );
      continue;
    }
    const evidenceRepair = await checkEvidence(finding, result, root.path);
    if (evidenceRepair) repairs.push(evidenceRepair);
  }
  for (const skipped of report.skipped) {
    const result = await validateSite(skipped.site, cwd, root.path, true);
    if (!result.ok) {
      repairs.push(
        repair(result.code, {
          root: root.path,
          site: skipped.site,
          message: `skipped[] ${result.message}`,
        })
      );
    }
  }
  for (const blocked of report.blocked ?? []) {
    const result = await validateSite(blocked.site, cwd, root.path, true);
    if (!result.ok) {
      repairs.push(
        repair(result.code, {
          root: root.path,
          site: blocked.site,
          message: `blocked[] ${result.message}`,
        })
      );
    }
  }
  return repairs;
};

const eventKey = (filePath, event) => `${filePath}\0${event}`;

const indexApprovedEvents = (state) => {
  const keys = new Set();
  for (const entry of state.approvedFiles) {
    if (entry.kind !== "conversion_event") continue;
    for (const event of entry.expectedEvents ?? []) {
      keys.add(eventKey(entry.path, event));
    }
  }
  return keys;
};

const indexProposedEvents = (reports) => {
  const keys = new Set();
  for (const report of reports) {
    for (const finding of report.findings) {
      const site = normalizeSiteForRoot(report.root, finding.site);
      if (site === null) continue;
      keys.add(eventKey(site.path, finding.proposedEvent));
    }
  }
  return keys;
};

const checkProposedEvents = (report, approvedKeys) => {
  const repairs = [];
  for (const finding of report.findings) {
    const site = normalizeSiteForRoot(report.root, finding.site);
    if (
      site === null ||
      !approvedKeys.has(eventKey(site.path, finding.proposedEvent))
    ) {
      repairs.push(
        repair("discovery_proposed_event_unwired", {
          root: report.root,
          event: finding.proposedEvent,
          site: finding.site,
          message: `findings[].proposedEvent "${finding.proposedEvent}" at ${finding.site} has no matching approvedFiles[] entry listing it in expectedEvents. Add the event to the file you instrumented or remove the finding.`,
        })
      );
    }
  }
  return repairs;
};

const checkApprovedEvents = (root, ownedConversions, proposedKeys) => {
  const repairs = [];
  for (const af of ownedConversions) {
    for (const event of af.expectedEvents ?? []) {
      if (!proposedKeys.has(eventKey(af.path, event))) {
        repairs.push(
          repair("discovery_event_unproposed", {
            root: root.path,
            file: af.path,
            event,
            message: `approvedFiles "${af.path}" emits "${event}" but no discoveryReports[].findings[] in root "${root.path}" proposes it. Document the conversion site in findings[] before instrumenting.`,
          })
        );
      }
    }
  }
  return repairs;
};

export const checkDiscoveryReports = async (state, roots, cwd) => {
  const repairs = [];
  const reportsByRoot = indexReportsByRoot(state);
  const validRootPaths = new Set(roots.map((r) => r.path));
  const { filesByRoot } = indexConversionFilesByRoot(state, roots);
  const approvedKeys = indexApprovedEvents(state);
  const proposedKeys = indexProposedEvents(state.discoveryReports);
  for (const report of state.discoveryReports) {
    if (!validRootPaths.has(report.root)) {
      repairs.push(
        repair("discovery_report_unknown_root", {
          root: report.root,
          message: `discoveryReports[].root "${report.root}" does not match any enumerated root. Valid roots: ${[...validRootPaths].join(", ")}.`,
        })
      );
    }
  }
  for (const root of roots) {
    const report = reportsByRoot.get(root.path);
    if (!report) {
      repairs.push(
        repair("discovery_report_missing", {
          root: root.path,
          message: `Root "${root.path}" has no discoveryReports[] entry. Every enumerated root needs a report — even if you skipped it, document what you saw and why.`,
        })
      );
      continue;
    }
    if (report.findings.length === 0 && report.skipped.length === 0) {
      repairs.push(
        repair("discovery_report_empty", {
          root: root.path,
          message: `Root "${root.path}" has an empty discoveryReport — no findings and no skipped entries. Either propose conversion sites with findings[] or document specific paths/files you passed over with skipped[].`,
        })
      );
    }
    repairs.push(...(await checkFilesRead(report, root, cwd)));
    repairs.push(...(await checkSites(report, root, cwd)));
    repairs.push(
      ...checkApprovedEvents(
        root,
        filesByRoot.get(root.path) ?? [],
        proposedKeys
      )
    );
  }
  for (const report of state.discoveryReports) {
    repairs.push(...checkProposedEvents(report, approvedKeys));
  }
  return repairs;
};
