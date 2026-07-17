"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fileToScaledJpeg, toScaledJpeg } from "@/lib/image";

type Props = {
  /** Receives a scaled JPEG data URL. */
  onCapture: (dataUrl: string) => void;
  disabled?: boolean;
};

type Status = "starting" | "live" | "fallback";

/**
 * Live camera preview with a shutter button.
 *
 * If getUserMedia is unavailable or refused, this falls back to a file input
 * with capture="environment", which opens the phone's own camera app. That
 * covers a denied permission, a browser without the API, and the stricter
 * corners of iOS standalone PWAs. Showing a dead black rectangle instead would
 * leave the app with no way to scan at all.
 */
export default function CameraCapture({ onCapture, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Status>("starting");
  const [notice, setNotice] = useState<string | null>(null);

  // getUserMedia resolving only means the stream exists; the video element has
  // no frame — and so videoWidth 0 — for a moment afterwards. Capturing in that
  // window silently produces nothing, so the shutter waits for a real frame.
  const [frameReady, setFrameReady] = useState(false);

  const stopStream = useCallback(() => {
    // Without this the camera indicator light stays on after leaving the screen.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("fallback");
        setNotice("This browser can't show a live preview.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // "ideal" rather than "exact" so a laptop with only a front camera
          // still works during development.
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus("live");
      } catch (error) {
        if (cancelled) return;
        console.error("getUserMedia failed:", error);
        setStatus("fallback");
        setNotice(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera access was blocked, so we'll use your camera app instead."
            : "Live preview isn't available, so we'll use your camera app instead.",
        );
      }
    }

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [stopStream]);

  function handleShutter() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    onCapture(toScaledJpeg(video, video.videoWidth, video.videoHeight));
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    event.target.value = "";
    if (!file) return;

    try {
      onCapture(await fileToScaledJpeg(file));
    } catch (error) {
      console.error(error);
      setNotice("That photo couldn't be read. Try another.");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative flex-1 overflow-hidden rounded-2xl bg-black">
        {status !== "fallback" && (
          <video
            ref={videoRef}
            // playsInline is load-bearing on iOS: without it Safari takes the
            // video fullscreen and hides the shutter. muted is required for
            // autoplay to be allowed at all.
            playsInline
            muted
            autoPlay
            onLoadedMetadata={(event) => {
              if (event.currentTarget.videoWidth > 0) setFrameReady(true);
            }}
            className="h-full w-full object-cover"
          />
        )}

        {(status === "starting" || (status === "live" && !frameReady)) && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Starting camera…
          </p>
        )}

        {status === "live" && frameReady && <CardGuide />}

        {status === "fallback" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="text-4xl">📇</span>
            <p className="text-sm text-white/70">
              Tap below to open your camera and photograph the card.
            </p>
          </div>
        )}
      </div>

      {notice && (
        <p className="mt-3 text-center text-xs text-amber-600 dark:text-amber-400">
          {notice}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {status === "live" ? (
          <button
            type="button"
            onClick={handleShutter}
            disabled={disabled || !frameReady}
            className="mx-auto flex h-18 w-18 items-center justify-center rounded-full border-4 border-black/10 bg-white shadow-lg ring-1 ring-black/10 transition active:scale-95 disabled:opacity-50 dark:border-white/20 dark:bg-neutral-200"
            aria-label="Capture card"
          >
            <span className="h-14 w-14 rounded-full bg-blue-600" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || status === "starting"}
            className="w-full rounded-xl bg-blue-600 px-4 py-4 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
          >
            📷 Take a photo
          </button>
        )}

        {status === "live" && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="text-center text-sm text-neutral-500 underline underline-offset-4 disabled:opacity-50"
          >
            Choose an existing photo
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}

/** Card-shaped framing guide (a business card is roughly 85×55mm). */
function CardGuide() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="aspect-[85/55] w-full max-w-md rounded-xl border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
    </div>
  );
}
