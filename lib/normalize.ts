import { CARD_FIELD_ORDER, type CardFields } from "@/lib/schema";

/**
 * Tidies the model's output into a consistent shape.
 *
 * Done here rather than asked for in the prompt because the model does not
 * reliably honour formatting instructions — a probe against a card printed
 * "Tel +91 22 6789 1234" came back with the spaces intact despite the prompt
 * saying to strip them. Formatting is deterministic work, so it belongs in
 * code, where the result is the same every time.
 */

/** Collapses runs of whitespace and trims. */
function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Reduces a phone number to digits, keeping a leading + if present.
 *
 * Sheets full of "+91 22 6789 1234" and "(022) 6789-1234" cannot be sorted,
 * deduplicated or dialled reliably.
 */
export function normalizePhone(value: string): string {
  const trimmed = tidy(value);
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  // Keep + only where it was actually written, so we never imply a country
  // code the card didn't show.
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/**
 * Strips scheme, leading www. and any trailing slash, and lowercases.
 *
 * Domains are case-insensitive, so "Example.com" and "example.com" sorting as
 * two different values in the sheet would be noise.
 */
export function normalizeWebsite(value: string): string {
  return tidy(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function normalizeEmail(value: string): string {
  return tidy(value).toLowerCase();
}

export function normalizeCard(fields: CardFields): CardFields {
  const result = {} as CardFields;

  for (const key of CARD_FIELD_ORDER) {
    const value = fields[key];
    switch (key) {
      case "phone":
      case "mobile":
        result[key] = normalizePhone(value);
        break;
      case "website":
        result[key] = normalizeWebsite(value);
        break;
      case "email":
        result[key] = normalizeEmail(value);
        break;
      default:
        result[key] = tidy(value);
    }
  }

  return result;
}
