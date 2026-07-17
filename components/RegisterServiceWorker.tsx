"use client";

import { useEffect } from "react";

/**
 * Registers the service worker.
 *
 * Chrome on Android will not offer "Install app" without a registered service
 * worker that handles fetch, so this is what makes the app installable there.
 * iOS needs only the manifest, but registers this happily too.
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      // A failed registration costs the install prompt, not the app.
      console.error("Service worker registration failed:", error);
    });
  }, []);

  return null;
}
