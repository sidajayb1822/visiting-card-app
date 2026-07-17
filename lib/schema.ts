import { z } from "zod";

/**
 * The fields we pull off a business card, in the order they appear in the Sheet.
 */
export const CARD_FIELD_ORDER = [
  "full_name",
  "job_title",
  "company",
  "email",
  "phone",
  "mobile",
  "website",
  "address",
] as const;

export type CardFieldKey = (typeof CARD_FIELD_ORDER)[number];

export const FIELD_LABELS: Record<CardFieldKey, string> = {
  full_name: "Name",
  job_title: "Title",
  company: "Company",
  email: "Email",
  phone: "Phone",
  mobile: "Mobile",
  website: "Website",
  address: "Address",
};

/** Which on-screen keyboard each field should summon on a phone. */
export const FIELD_INPUT_MODES: Partial<
  Record<CardFieldKey, "email" | "tel" | "url">
> = {
  email: "email",
  phone: "tel",
  mobile: "tel",
  website: "url",
};

export const cardFieldsSchema = z.object({
  full_name: z.string(),
  job_title: z.string(),
  company: z.string(),
  email: z.string(),
  phone: z.string(),
  mobile: z.string(),
  website: z.string(),
  address: z.string(),
});

export type CardFields = z.infer<typeof cardFieldsSchema>;

export const EMPTY_CARD: CardFields = {
  full_name: "",
  job_title: "",
  company: "",
  email: "",
  phone: "",
  mobile: "",
  website: "",
  address: "",
};

/**
 * JSON Schema handed to Gemini via `response_format.schema`.
 *
 * Absent fields come back as "" rather than null: every field stays a plain
 * string end to end, so the form, the zod check and the Sheet never need a
 * null branch. Written out by hand rather than derived from the zod schema
 * because Gemini accepts an OpenAPI-flavoured subset of JSON Schema, and a
 * generated one tends to emit constructs it rejects.
 */
export const CARD_JSON_SCHEMA = {
  type: "object",
  properties: {
    full_name: {
      type: "string",
      description: "Person's full name as printed. Empty string if absent.",
    },
    job_title: {
      type: "string",
      description:
        "Job title or role, e.g. 'VP Sales'. Empty string if absent.",
    },
    company: {
      type: "string",
      description: "Company or organisation name. Empty string if absent.",
    },
    email: {
      type: "string",
      description:
        "Email address. If several, the personal one. Empty string if absent.",
    },
    phone: {
      type: "string",
      description:
        "Landline / office / desk number, as printed. Empty string if absent.",
    },
    mobile: {
      type: "string",
      description: "Mobile / cell number, as printed. Empty string if absent.",
    },
    website: {
      type: "string",
      description: "Company website, as printed. Empty string if absent.",
    },
    address: {
      type: "string",
      description:
        "Full postal address on one line, comma separated. Empty string if absent.",
    },
  },
  required: [...CARD_FIELD_ORDER],
} as const;

export const CARD_PROMPT = `You are reading a photograph of a business card.

Extract the contact details into the given JSON schema.

Rules:
- Transcribe ONLY what is printed on the card. Never invent, complete or correct a value.
- If a field is not on the card, return an empty string for it. Do not guess.
- Distinguish phone from mobile using the card's own labels (Tel/Office/Direct vs Mobile/Cell/M).
  If exactly one number is present and unlabelled, put it in "phone" and leave "mobile" empty.
- Keep the country code if one is shown, and do not add one if it is not.
- The card may be in any language, and text may run vertically or be laid out in columns.
- If the image is not a business card, or is too blurred to read, return empty strings for every field.`;
