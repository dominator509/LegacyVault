export type DlpFinding =
  | "password"
  | "pin"
  | "recovery-code"
  | "seed-phrase"
  | "private-key"
  | "complete-ssn"
  | "payment-card"
  | "safe-combination"
  | "prompt-injection";

const rules: readonly [DlpFinding, RegExp][] = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/iu],
  ["complete-ssn", /\b\d{3}-\d{2}-\d{4}\b/u],
  ["password", /\b(?:password|passcode|authentication answer)\s*[:=]\s*\S+/iu],
  ["pin", /\bpin\s*[:=]\s*\d{4,12}\b/iu],
  ["recovery-code", /\b(?:recovery|backup)\s+code\s*[:=]\s*[A-Z0-9-]{6,}\b/iu],
  ["seed-phrase", /\b(?:seed|recovery)\s+phrase\s*[:=]/iu],
  ["safe-combination", /\b(?:safe|vault)\s+combination\s*[:=]/iu],
  [
    "prompt-injection",
    /\b(?:ignore|override)\s+(?:all\s+)?(?:previous|prior|system)\s+instructions\b/iu,
  ],
];

function passesLuhn(value: string): boolean {
  const digits = value.replace(/\D/gu, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let total = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    total += digit;
    double = !double;
  }
  return total % 10 === 0;
}

export function scanDlp(text: string): readonly DlpFinding[] {
  const findings = new Set<DlpFinding>();
  for (const [finding, pattern] of rules)
    if (pattern.test(text)) findings.add(finding);
  for (const candidate of text.match(/(?:\d[ -]?){13,19}/gu) ?? [])
    if (passesLuhn(candidate)) findings.add("payment-card");
  return [...findings].sort();
}
