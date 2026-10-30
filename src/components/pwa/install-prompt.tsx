"use client";

import { useEffect, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { isIos, isStandalone } from "./browser";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const VISITS_KEY = "diary:visits";
const DISMISSED_KEY = "diary:install-dismissed";

function bump(key: string) {
  try {
    const n = Number(localStorage.getItem(key) ?? 0) + 1;
    localStorage.setItem(key, String(n));
    return n;
  } catch {
    return 0;
  }
}

// "banner": on Today from the second visit until dismissed. "card": always, in Profile.
export function InstallPrompt({ mode, labels }: { mode: "banner" | "card"; labels: Dictionary["pwa"] }) {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [state, setState] = useState<"hidden" | "android" | "ios" | "installed">("hidden");

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setState((s) => (s === "installed" ? s : "android"));
    };
    const onInstalled = () => setState("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Decide once on mount, from browser-only facts.
    const decide = () => {
      if (isStandalone()) return "installed" as const;
      if (mode === "banner") {
        const visits = bump(VISITS_KEY);
        let dismissed = false;
        try {
          dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
        } catch {}
        if (visits < 2 || dismissed) return "hidden" as const;
      }
      return isIos() ? ("ios" as const) : ("hidden" as const); // Android waits for beforeinstallprompt
    };
    const initial = decide();
    queueMicrotask(() => setState((s) => (s === "android" && initial === "hidden" ? s : initial)));

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [mode]);

  if (mode === "banner" && (state === "hidden" || state === "installed")) return null;
  if (mode === "card" && state === "hidden") return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
    setState("hidden");
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") setState("installed");
    setEvent(null);
  }

  return (
    <div
      className={
        mode === "banner"
          ? "mb-6 rounded-2xl border border-accent/30 bg-accent-soft p-4"
          : "mb-4 rounded-2xl border border-line bg-surface p-4"
      }
    >
      {mode === "card" && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{labels.appSection}</p>
      )}
      <p className="text-sm font-semibold">{state === "installed" ? labels.installed : labels.installTitle}</p>
      {state !== "installed" && (
        <>
          <p className="mt-0.5 text-sm text-muted">{state === "ios" ? labels.installIos : labels.installBody}</p>
          <div className="mt-3 flex gap-2">
            {state === "android" && (
              <button type="button" onClick={install} className="btn">
                {labels.installButton}
              </button>
            )}
            {mode === "banner" && (
              <button type="button" onClick={dismiss} className="btn-ghost">
                {labels.dismiss}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
