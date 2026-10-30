"use client";

import { useEffect } from "react";
import { PAGES_CACHE } from "./browser";

// Rendered on the login page: whoever used this device before must not leave
// pages or notifications behind for the next person.
export function ClearPrivateData() {
  useEffect(() => {
    if ("caches" in window) caches.delete(PAGES_CACHE).catch(() => {});
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then(async (reg) => {
        const sub = await reg?.pushManager.getSubscription();
        await sub?.unsubscribe();
      }).catch(() => {});
    }
  }, []);
  return null;
}
