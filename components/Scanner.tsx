"use client";

import { useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import PasscodeGate from "@/components/PasscodeGate";
import ReviewForm from "@/components/ReviewForm";
import { EMPTY_CARD, type CardFields } from "@/lib/schema";

type Stage =
  | { kind: "locked" }
  | { kind: "capture" }
  | { kind: "reading"; image: string }
  | { kind: "review"; image: string; fields: CardFields }
  | { kind: "saved"; label: string };

export default function Scanner({ unlocked }: { unlocked: boolean }) {
  const [stage, setStage] = useState<Stage>(
    unlocked ? { kind: "capture" } : { kind: "locked" },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Pulls an error message out of a failed response, with a sane fallback. */
  async function messageFor(response: Response, fallback: string) {
    const body = await response.json().catch(() => null);
    return typeof body?.error === "string" ? body.error : fallback;
  }

  async function handleCapture(image: string) {
    setStage({ kind: "reading", image });
    setError(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });

      // The session expired mid-use; send them back to the passcode.
      if (response.status === 401) {
        setStage({ kind: "locked" });
        return;
      }

      if (!response.ok) {
        setError(await messageFor(response, "Couldn't read that card."));
        setStage({ kind: "capture" });
        return;
      }

      const { fields } = await response.json();
      // Go to review even when nothing was found: the form says so, and typing
      // it in beats being bounced back to the camera with no explanation.
      setStage({ kind: "review", image, fields: fields ?? EMPTY_CARD });
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      setStage({ kind: "capture" });
    }
  }

  async function handleSave(fields: CardFields) {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });

      if (response.status === 401) {
        setStage({ kind: "locked" });
        return;
      }

      if (!response.ok) {
        // Stay on the form so the typed-in corrections survive a retry.
        setError(await messageFor(response, "Couldn't save to the sheet."));
        return;
      }

      setStage({
        kind: "saved",
        label: fields.full_name.trim() || fields.company.trim() || "Card",
      });
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-4">
      {stage.kind === "locked" && (
        <PasscodeGate onUnlocked={() => setStage({ kind: "capture" })} />
      )}

      {stage.kind === "capture" && (
        <>
          <Header />
          {error && <ErrorNote>{error}</ErrorNote>}
          <CameraCapture onCapture={handleCapture} />
        </>
      )}

      {stage.kind === "reading" && (
        <>
          <Header />
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stage.image}
              alt="The card being read"
              className="w-full rounded-xl opacity-40"
            />
            <p className="text-sm text-neutral-500">Reading the card…</p>
          </div>
        </>
      )}

      {stage.kind === "review" && (
        <>
          <Header />
          <ReviewForm
            initial={stage.fields}
            imageDataUrl={stage.image}
            onSave={handleSave}
            onRetake={() => {
              setError(null);
              setStage({ kind: "capture" });
            }}
            saving={saving}
            error={error}
          />
        </>
      )}

      {stage.kind === "saved" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700 dark:bg-green-950 dark:text-green-400">
            ✓
          </div>
          <div>
            <p className="text-lg font-semibold">Saved to sheet</p>
            <p className="mt-1 text-sm text-neutral-500">{stage.label}</p>
          </div>
          <button
            type="button"
            onClick={() => setStage({ kind: "capture" })}
            className="mt-2 w-full max-w-xs rounded-xl bg-blue-600 px-4 py-4 text-base font-semibold text-white transition active:scale-[0.99]"
          >
            Scan next card
          </button>
        </div>
      )}
    </main>
  );
}

function Header() {
  return (
    <header className="mb-3">
      <h1 className="text-base font-semibold">Card Scanner</h1>
    </header>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {children}
    </p>
  );
}
