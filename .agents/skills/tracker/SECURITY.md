# Security

## Reporting

Report security issues to security@hellyeah.ai. Include the affected version,
the command you ran, and the smallest reproduction you can share.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.2.x   | Yes       |
| 0.1.x   | Yes (until 0.3 ships) |

## Scope

The security contract for this skill lives in [TRUST.md](./TRUST.md). It
lists the subprocesses, files written, failure semantics, and grep recipes
for verifying every claim against the scripts.

The 0.2.0 hardening removed harness-driven source mutation entirely. Source
edits happen only via the agent's Edit tool, which appears verbatim in the
agent transcript. Subprocesses still inherit the parent environment by
default; the skill does not redact environment variables before invoking
package managers or the `hellyeah` CLI.
