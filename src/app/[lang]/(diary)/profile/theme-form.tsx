"use client";

import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

const KEY = "diary:theme";
const listeners = new Set<() => void>();

// The choice lives in this browser only. "system" is no stored value at all, so the device setting decides.
function read(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function choose(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {}
  // The same attribute the script in the root layout sets before the first paint.
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  listeners.forEach((notify) => notify());
}

export function ThemeForm({ labels }: { labels: { theme: string; light: string; dark: string; system: string } }) {
  const current = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const options: { value: Theme; label: string }[] = [
    { value: "light", label: labels.light },
    { value: "dark", label: labels.dark },
    { value: "system", label: labels.system },
  ];
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium">{labels.theme}</legend>
      <div className="flex rounded-lg bg-surface-2 p-1 text-sm font-medium">
        {options.map(({ value, label }) => (
          <label
            key={value}
            className="relative flex min-h-9 flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-center has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent text-muted hover:text-ink"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={current === value}
              onChange={() => choose(value)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
