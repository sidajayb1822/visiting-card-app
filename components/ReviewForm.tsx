"use client";

import { useState } from "react";
import {
  CARD_FIELD_ORDER,
  FIELD_INPUT_MODES,
  FIELD_LABELS,
  type CardFields,
} from "@/lib/schema";

type Props = {
  initial: CardFields;
  imageDataUrl: string;
  onSave: (fields: CardFields) => Promise<void>;
  onRetake: () => void;
  saving: boolean;
  error: string | null;
};

export default function ReviewForm({
  initial,
  imageDataUrl,
  onSave,
  onRetake,
  saving,
  error,
}: Props) {
  const [fields, setFields] = useState<CardFields>(initial);
  const [zoomed, setZoomed] = useState(false);

  const isEmpty = Object.values(fields).every((value) => value.trim() === "");

  function update(key: keyof CardFields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(fields);
      }}
    >
      {/* Keeping the shot on screen means a suspect field can be checked
          against the card without scanning it again. object-contain, not cover:
          cover crops the top off a landscape card, hiding the name — the field
          most worth checking. Contained in a short box it's too small to read,
          so tapping expands it. */}
      <button
        type="button"
        onClick={() => setZoomed((current) => !current)}
        className="relative overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-900"
        aria-label={zoomed ? "Shrink the card photo" : "Enlarge the card photo"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageDataUrl}
          alt="The card you scanned"
          className={`w-full object-contain transition-[max-height] duration-200 ${
            zoomed ? "max-h-[70vh]" : "max-h-44"
          }`}
        />
        <span className="absolute right-2 bottom-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
          {zoomed ? "Tap to shrink" : "Tap to enlarge"}
        </span>
      </button>

      {isEmpty && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Nothing readable was found on that photo. Retake it, or type the
          details in yourself.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {CARD_FIELD_ORDER.map((key) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-500">
              {FIELD_LABELS[key]}
            </span>
            <input
              value={fields[key]}
              onChange={(event) => update(key, event.target.value)}
              inputMode={FIELD_INPUT_MODES[key]}
              autoCapitalize={key === "email" || key === "website" ? "none" : "words"}
              autoCorrect="off"
              spellCheck={false}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base text-neutral-900 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </label>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-blue-600 px-4 py-4 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save to sheet"}
        </button>
        <button
          type="button"
          onClick={onRetake}
          disabled={saving}
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
        >
          Retake
        </button>
      </div>
    </form>
  );
}
