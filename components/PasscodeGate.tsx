"use client";

import { useState } from "react";

type Props = {
  onUnlocked: () => void;
};

export default function PasscodeGate({ onUnlocked }: Props) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      if (response.ok) {
        onUnlocked();
        return;
      }

      const { error: message } = await response.json().catch(() => ({}));
      setError(message ?? "That didn't work. Try again.");
      setPasscode("");
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-1 flex-col items-center justify-center gap-5"
    >
      <div className="text-center">
        <div className="text-5xl">📇</div>
        <h1 className="mt-3 text-xl font-semibold">Card Scanner</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Enter the passcode to continue.
        </p>
      </div>

      <input
        type="password"
        value={passcode}
        onChange={(event) => setPasscode(event.target.value)}
        // A password manager offering to save this would be noise, not help.
        autoComplete="off"
        autoFocus
        placeholder="Passcode"
        className="w-full max-w-xs rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center text-base tracking-widest text-neutral-900 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      />

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={busy || passcode.length === 0}
        className="w-full max-w-xs rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
      >
        {busy ? "Checking…" : "Unlock"}
      </button>

      <p className="max-w-xs text-center text-xs text-neutral-400">
        You&apos;ll stay unlocked on this device for 30 days.
      </p>
    </form>
  );
}
