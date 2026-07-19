import { isIP } from "node:net";
import { isFlagEnabled } from "./utils.mjs";

const HOST_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const LOCALHOST_RE = /(^|\.)localhost$/;
const PLACEHOLDER_TLD = ".invalid";
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const TRAILING_DOT_RE = /\.$/;

const invalidHostname = (raw) =>
  new Error(`Invalid production hostname: ${raw}`);

export const normalizeHostname = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw || raw.includes("*"))
    throw new Error("Production domain must be an exact hostname.");
  const input = SCHEME_RE.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid production domain: ${raw}`);
  }
  if (url.username || url.password)
    throw new Error("Production domain must not include credentials.");
  const host = url.hostname.toLowerCase().replace(TRAILING_DOT_RE, "");
  if (!host || host.includes("_") || host.includes(".."))
    throw invalidHostname(raw);
  const ipHost = host.replace(/^\[|\]$/g, "");
  if (isIP(ipHost) !== 0 || LOCALHOST_RE.test(host)) {
    throw new Error(
      "Production domain must not be localhost or an IP address."
    );
  }
  const labels = host.split(".");
  if (labels.length < 2 || host.length > 253) {
    throw new Error(
      `Production domain must be a fully-qualified hostname: ${raw}`
    );
  }
  if (!labels.every((label) => HOST_LABEL_RE.test(label)))
    throw invalidHostname(raw);
  if (host.endsWith(PLACEHOLDER_TLD)) {
    throw new Error(
      `Production domain must not use the placeholder ${PLACEHOLDER_TLD} namespace.`
    );
  }
  return host;
};

export const normalizeDomainList = (values) => {
  const parts = values
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const domains = [];
  for (const part of parts) {
    const host = normalizeHostname(part);
    if (!domains.includes(host)) domains.push(host);
  }
  if (domains.length === 0)
    throw new Error("Pass --domain <production-hostname> for tracker safety.");
  return domains;
};

export const resolveProductionDomains = (flags = {}) => {
  const preLaunch = isFlagEnabled(flags, "pre-launch");
  const values = [];
  if (flags.domain && flags.domain !== true) values.push(flags.domain);
  if (flags.domains && flags.domains !== true) values.push(flags.domains);
  if (preLaunch && values.length > 0)
    throw new Error("Pass exactly one of --domain or --pre-launch.");
  if (preLaunch) {
    return { mode: "pre-launch" };
  }
  const allowlist = normalizeDomainList(values);
  return {
    allowlist,
    mode: "production",
    primary: allowlist[0],
    value: allowlist.join(","),
  };
};
