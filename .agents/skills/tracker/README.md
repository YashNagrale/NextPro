# Hellyeah Tracker Skill

The tracker skill installs Hellyeah X-Ray analytics into an existing web app.
The agent maps the product journey, decides where conversion events fire, and
edits source via the Edit tool. The harness owns two boring deterministic
postconditions: provisioning the tracker once at verify time when needed, and
verifying that the agent-authored install matches the install state it declared.

## License

This skill is private and proprietary. Authorized users may install it for
authorized Hellyeah work. Installation copies the
skill into a local agent skills directory; that copy remains covered by the
[Hellyeah Proprietary License](./LICENSE.md). Do not publish, redistribute,
resell, sublicense, or share installed skill files outside authorized Hellyeah
channels without written permission from Hellyeah Inc.

## Install

From the Hellyeah CLI:

```bash
hellyeah skills add tracker
```

The skill does not need a tracker UUID up front. During verify, it resolves the
org tracker with `hellyeah tracker state --json`; if the org has no tracker, it
creates one with `hellyeah tracker create --domain <host> --json --yes` or
`hellyeah tracker create --pre-launch --json --yes`.

From a local checkout:

```bash
npx skills add ./packages/skills/catalog --skill tracker
```

From GitHub, you need access to the private repository:

```bash
npx skills add finalroundai/hellyeah-v2 --skill tracker --full-depth
```

If repo-wide discovery conflicts with another skill directory, install the
direct tree URL:

```bash
npx skills add https://github.com/finalroundai/hellyeah-v2/tree/main/packages/skills/catalog/tracker
```

GitHub CLI install is also supported:

```bash
# From GitHub
gh skill install finalroundai/hellyeah-v2 packages/skills/catalog/tracker --agent <agent>

# From a local checkout
gh skill install ./packages/skills tracker --from-local --agent <agent>
```

Use `--scope user` for a user-level install. Omit `--agent <agent>` if you
want GitHub CLI to ask interactively.

Manual install is also supported: copy this directory into your agent's skills
directory, keeping `SKILL.md`, `scripts/`, and `references/` together.

## Compatibility

Requires Node.js 20 or newer. The skill requires `hellyeah` CLI `1.0.0+`.
The first verify subprocess is a version check, followed by exactly one
`tracker state`; when state reports `no_tracker`, verify runs one
`tracker create`.

## Trust

Read [SKILL.md](./SKILL.md) for the agent workflow, [TRUST.md](./TRUST.md)
for the security contract, and [SECURITY.md](./SECURITY.md) for reporting.

The scripts make no telemetry calls. The Hellyeah CLI subprocesses inherit the
parent environment; the skill does not redact environment variables.
End-to-end event delivery confirmation is outside this skill's completion gate
until the Hellyeah CLI can fetch recent X-Ray events directly.
