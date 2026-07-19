export const INSTALL_STATE_VERSION = 3;

export const ARTIFACTS = {
  installStatePath: "node_modules/.cache/hellyeah-tracker/install-state.json",
  approvedFiles: "approvedFiles",
  discoveryReports: "discoveryReports",
  filesRead: "filesRead",
  findings: "findings",
  skipped: "skipped",
  blocked: "blocked",
};

export const WORKFLOW_STEP_IDS = {
  prepare: "prepare",
  classifyRoots: "classify-roots",
  discover: "discover",
  presentPlan: "present-plan",
  installSdk: "install-sdk",
  editSource: "edit-source",
  selfAudit: "self-audit",
  writeInstallState: "write-install-state",
  verify: "verify",
};

export const buildNextSteps = (cwd, domains = null) => [
  {
    id: WORKFLOW_STEP_IDS.classifyRoots,
    label:
      "Step 2a: use Explore sub-agents to classify every roots[] entry from source evidence: entry surface, conversion authority, worker, dashboard, docs, utility, or skip. A root can have multiple roles. Full-stack frameworks (Next.js, Nuxt, Remix, SvelteKit) routinely have backend route handlers — do not assume frontend-only from deps alone.",
  },
  {
    id: WORKFLOW_STEP_IDS.discover,
    label:
      "Step 2b: use Explore sub-agents to inspect sourceFiles[] and identify conversion sites for every root. Look for cv.* opportunities (payment webhooks, signup handlers, lead form routes, calendar webhooks, search, product views, cart events) AND product-specific custom events (activation moments, network effects, vertical milestones). Custom events are additive to cv.*, never substitutes. references/conversion-discovery.md is the meaning reference.",
  },
  {
    id: WORKFLOW_STEP_IDS.presentPlan,
    label:
      "Step 3: render two tables in chat before package install, source edits, or .env edits: (1) roots table with semantic role + planned instrumentation per root, (2) planned events list (file:line + event name + kind + identity bridge + rationale). Wait for confirmation.",
  },
  {
    id: WORKFLOW_STEP_IDS.installSdk,
    label:
      "Step 4: install @hellyeah/x-ray in every root that will import it, then read the SDK types. Multi-target by default — entry surface for the browser SDK, every backend/worker root for the server SDK.",
    command: "<your package manager> add @hellyeah/x-ray",
  },
  {
    id: WORKFLOW_STEP_IDS.editSource,
    label:
      "Step 5: edit source — server SDK singleton in backend roots, provider mount in entry surface, cv.* events at the actual conversion sites (use the typed cv.X constant from @hellyeah/x-ray, never the wire-format `cv_X` string literal), custom events at product-specific milestones.",
  },
  {
    id: WORKFLOW_STEP_IDS.selfAudit,
    label:
      "Step 6: walk the self-audit in chat — identity bridge across surfaces, catalog-meaning vs. domain-meaning per cv.* event, event-name form (cv.X not cv_X), SDK peer-dep range vs. host frameworks. Catches judgment errors that schema validation can't.",
  },
  {
    id: WORKFLOW_STEP_IDS.writeInstallState,
    label: `Step 7: write ${ARTIFACTS.installStatePath} (version: ${INSTALL_STATE_VERSION}). Every root needs a ${ARTIFACTS.discoveryReports}[] entry with ${ARTIFACTS.filesRead} (which files you opened), ${ARTIFACTS.findings} (file:line + proposedEvent + rationale + evidence-from-source for each conversion site you'll instrument), and ${ARTIFACTS.skipped} (file:line + reason for paths you considered but passed over). Every server cv.* finding needs an identityBridge recording how browser identity reaches it, or a deferred justification. Findings must wire to approvedFiles and vice versa.`,
  },
  {
    id: WORKFLOW_STEP_IDS.verify,
    label:
      "Step 8: verify after edits. Verify resolves the org tracker through hellyeah tracker state and provisions once through hellyeah tracker create when no tracker exists, writes env files, completes validation, then submit one structured hellyeah feedback JSON payload for the terminal outcome before the final chat response. Then hand back: show the diff summary and, when the repo qualifies, ask once whether to open a PR (SKILL.md 'Hand back'). Never commit or push without an explicit yes.",
    command:
      domains?.mode === "pre-launch"
        ? `node scripts/cli.mjs verify --cwd ${cwd} --pre-launch`
        : `node scripts/cli.mjs verify --cwd ${cwd}${
            domains?.primary ? ` --domain ${domains.primary}` : ""
          }`,
  },
];
