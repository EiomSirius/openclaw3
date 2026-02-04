/**
 * PII/PCI entity-to-pattern mapping for redaction and detection.
 * Used by output redaction (logs, tool summaries, status) and optional ingestion redaction.
 */

/** Entity keys supported for PII/PCI redaction. */
export const PII_ENTITY_KEYS = [
  "credit_card",
  "ssn",
  "email",
  "phone_number",
  "ip_address",
  "mac_address",
  "zip_code",
  "cvv",
  "routing_number",
  "bank_account_number",
  "driver_license",
  "imei",
  "serial_number",
  "expiration_date",
] as const;

export type PiiEntityKey = (typeof PII_ENTITY_KEYS)[number];

/**
 * Regex source strings per entity. One or more patterns per key.
 * Patterns use capturing groups so the last group is the token to replace.
 */
const PII_ENTITY_PATTERNS: Record<PiiEntityKey, string[]> = {
  // 13-19 digits with optional spaces/dashes (card number)
  credit_card: [
    String.raw`\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b`,
    String.raw`\b(\d{4}[\s-]?\d{6}[\s-]?\d{5})\b`,
  ],
  // US SSN with dashes or 9 consecutive digits
  ssn: [String.raw`\b(\d{3}-\d{2}-\d{4})\b`, String.raw`\b(\d{9})\b(?=\s|$|[^\d])`],
  // Email (simple; avoid matching long tokens)
  email: [String.raw`\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b`],
  // US 10-digit phone with optional separators; E.164 +1
  phone_number: [
    String.raw`\b(\+1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b`,
    String.raw`\b(\+\d{1,3}[-.\s]?\d{6,14})\b`,
  ],
  // IPv4
  ip_address: [
    String.raw`\b((?:25[0-5]|2[0-4]\d|1?\d\d?)\.(?:25[0-5]|2[0-4]\d|1?\d\d?)\.(?:25[0-5]|2[0-4]\d|1?\d\d?)\.(?:25[0-5]|2[0-4]\d|1?\d\d?))\b`,
  ],
  // MAC address (colon or dash separated hex)
  mac_address: [
    String.raw`\b([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})\b`,
    String.raw`\b([0-9A-Fa-f]{2}(?:-[0-9A-Fa-f]{2}){5})\b`,
  ],
  // US ZIP 5 or 5+4
  zip_code: [String.raw`\b(\d{5}(?:-\d{4})?)\b`],
  // CVV 3 or 4 digits (may have false positives; use with other context)
  cvv: [String.raw`\b(\d{3,4})\b(?=\s|$|[^\d])`],
  // US routing number 9 digits
  routing_number: [String.raw`\b(\d{9})\b(?=\s|$|[^\d])`],
  // Bank account: 8-17 digits (conservative)
  bank_account_number: [String.raw`\b(?:account|acct|account\s*#?)\s*:?\s*(\d{8,17})\b`],
  // Driver license: alphanumeric block (1-2 letters + 5-9 alphanumeric)
  driver_license: [String.raw`\b([A-Z]{1,2}\d{5,9})\b`],
  // IMEI 15 digits
  imei: [String.raw`\b(\d{15})\b(?=\s|$|[^\d])`],
  // Serial: alphanumeric with dashes (conservative)
  serial_number: [String.raw`\b(?:serial|sn|s/n)\s*:?\s*([A-Za-z0-9-]{6,24})\b`],
  // Expiration date MM/YY or MM-YY
  expiration_date: [String.raw`\b(0[1-9]|1[0-2])[/-](\d{2})\b`],
};

/** Entity keys enabled by default when PII redaction is "on". */
export const DEFAULT_PII_ENTITIES: PiiEntityKey[] = [
  "credit_card",
  "ssn",
  "email",
  "phone_number",
  "ip_address",
  "mac_address",
  "zip_code",
  "cvv",
  "routing_number",
];

const VALID_ENTITY_SET = new Set<string>(PII_ENTITY_KEYS);

function isValidEntity(key: string): key is PiiEntityKey {
  return VALID_ENTITY_SET.has(key);
}

/** Returns flat list of regex source strings for the given entity keys. */
export function getPiiPatternsForEntities(entities: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of entities) {
    if (!isValidEntity(key)) {
      continue;
    }
    for (const src of PII_ENTITY_PATTERNS[key]) {
      if (!seen.has(src)) {
        seen.add(src);
        out.push(src);
      }
    }
  }
  return out;
}

/** Placeholder used when redacting at ingestion. */
const REDACTED_PLACEHOLDER = "[REDACTED]";

/**
 * Returns entity keys that had at least one match in text.
 */
export function detectPiiInText(text: string, entities: string[]): string[] {
  if (!text || entities.length === 0) {
    return [];
  }
  const detected = new Set<string>();
  for (const key of entities) {
    if (!isValidEntity(key)) {
      continue;
    }
    for (const src of PII_ENTITY_PATTERNS[key]) {
      try {
        const re = new RegExp(src, "gi");
        if (re.test(text)) {
          detected.add(key);
          break;
        }
      } catch {
        // skip invalid pattern
      }
    }
  }
  return [...detected];
}

/**
 * Replaces PII matches in text with a placeholder.
 * Uses the same pattern set as output redaction for consistency.
 */
export function redactPiiInText(text: string, entities: string[]): string {
  if (!text || entities.length === 0) {
    return text;
  }
  const sources = getPiiPatternsForEntities(entities);
  let out = text;
  for (const src of sources) {
    try {
      const re = new RegExp(src, "gi");
      out = out.replace(re, REDACTED_PLACEHOLDER);
    } catch {
      // skip invalid pattern
    }
  }
  return out;
}
