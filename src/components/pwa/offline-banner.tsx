"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function OfflineBanner({ text }: { text: string }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <p role="status" className="arrive-down mb-4 rounded-lg border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-sm font-medium text-warn">
      {text}
    </p>
  );
}
