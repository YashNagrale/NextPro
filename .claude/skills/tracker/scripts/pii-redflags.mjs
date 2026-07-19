import { findMatchingBrace } from "./utils.mjs";

const PII_KEYS = ["email", "phone"];
const ALIAS_KEYS = ["contact", "customer", "billingdetails", "profile"];

const METADATA_KEY_RE = /metadata\s*:\s*\{/gi;
const SPREAD_RE = /\.\.\.[a-zA-Z_$]/;
const NESTED_OBJECT_RE = /\{[^}]/;

const lineNumberAt = (content, offset) =>
  content.slice(0, offset).split("\n").length;

const keyPattern = (key) => new RegExp(`\\b${key}\\s*:`, "i");

const extractMetadataBlocks = (content) => {
  const blocks = [];
  for (const match of content.matchAll(METADATA_KEY_RE)) {
    const openIdx = match.index + match[0].length - 1;
    const closeIdx = findMatchingBrace(content, openIdx);
    if (closeIdx === -1) continue;
    blocks.push({
      body: content.slice(openIdx + 1, closeIdx),
      startIdx: match.index,
    });
  }
  return blocks;
};

export const findPiiRedFlags = (filePath, content) => {
  const flags = [];
  for (const block of extractMetadataBlocks(content)) {
    const issues = [];
    for (const key of PII_KEYS) {
      if (keyPattern(key).test(block.body)) {
        issues.push(`literal_${key}_in_metadata`);
      }
    }
    for (const alias of ALIAS_KEYS) {
      if (keyPattern(alias).test(block.body)) {
        issues.push(`alias_${alias}_in_metadata`);
      }
    }
    if (SPREAD_RE.test(block.body)) issues.push("object_spread_in_metadata");
    if (NESTED_OBJECT_RE.test(block.body))
      issues.push("nested_object_in_metadata");
    if (issues.length > 0) {
      flags.push({
        file: filePath,
        line: lineNumberAt(content, block.startIdx),
        issues,
      });
    }
  }
  return flags;
};
