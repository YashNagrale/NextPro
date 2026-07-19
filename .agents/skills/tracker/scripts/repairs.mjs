export const repair = (code, fields) => ({ code, ...fields });

export const renderPiiRepair = (flag) =>
  repair("pii_in_metadata", {
    file: flag.file,
    line: flag.line,
    issues: flag.issues,
    message: `PII risk near cv.* call: ${flag.issues.join(", ")}. Move email/phone to identity:, never metadata:.`,
  });
