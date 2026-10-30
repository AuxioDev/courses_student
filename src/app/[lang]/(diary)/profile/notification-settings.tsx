"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { NotificationType } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { removePushSubscription, savePushSubscription, updateNotificationPreferences } from "@/app/actions";
import { isIos, isStandalone, pushSupported, urlBase64ToUint8Array } from "@/components/pwa/browser";

type Prefs = Record<NotificationType, { email: boolean; push: boolean }>;
type DeviceState = "checking" | "unsupported" | "ios-install" | "blocked" | "off" | "on";

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function PushDevice({ labels }: { labels: Dictionary["pwa"] }) {
  const [state, setState] = useState<DeviceState>("checking");
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: DeviceState;
      if (isIos() && !isStandalone()) next = "ios-install";
      else if (!pushSupported()) next = "unsupported";
      else if (Notification.permission === "denied") next = "blocked";
      else next = (await currentSubscription()) ? "on" : "off";
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function enable() {
    start(async () => {
      setFailed(false);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""),
          }));
        const result = await savePushSubscription(sub.toJSON());
        if (!result.ok) throw new Error("save failed");
        setState("on");
      } catch {
        setFailed(true);
      }
    });
  }

  function disable() {
    start(async () => {
      const sub = await currentSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });
  }

  const message =
    state === "unsupported"
      ? labels.pushUnsupported
      : state === "ios-install"
        ? labels.pushIosInstall
        : state === "blocked"
          ? labels.pushBlocked
          : state === "on"
            ? labels.pushOn
            : null;

  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold">{labels.pushTitle}</h2>
      <p className="mt-0.5 text-xs text-muted">{labels.pushHint}</p>
      {message && <p className={`mt-2 text-sm ${state === "on" ? "text-good" : "text-muted"}`}>{message}</p>}
      {failed && <p className="mt-2 text-sm text-bad">{labels.pushFailed}</p>}
      {(state === "off" || state === "on") && (
        <button
          type="button"
          onClick={state === "on" ? disable : enable}
          disabled={pending}
          className={`mt-2 ${state === "on" ? "btn-ghost" : "btn"}`}
        >
          {state === "on" ? labels.pushDisable : labels.pushEnable}
        </button>
      )}
    </div>
  );
}

export function NotificationSettings({
  current,
  typeLabels,
  labels,
  saveLabels,
  ok,
}: {
  current: Prefs;
  typeLabels: Dictionary["notifications"]["type"];
  labels: Dictionary["pwa"];
  saveLabels: { save: string; saving: string };
  ok: Dictionary["ok"];
}) {
  const [state, action, pending] = useActionState(updateNotificationPreferences, undefined);
  return (
    <>
      <PushDevice labels={labels} />
      <form action={action} className="border-t border-line pt-4">
        <h2 className="text-sm font-semibold">{labels.notificationsTitle}</h2>
        <p className="mb-2 mt-0.5 text-xs text-muted">{labels.notificationsHint}</p>
        <table className="mb-3 w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-medium" />
              <th className="w-16 py-1 font-medium">{labels.colEmail}</th>
              <th className="w-16 py-1 font-medium">{labels.colPush}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(Object.keys(current) as NotificationType[]).map((type) => (
              <tr key={type}>
                <td className="py-1">{typeLabels[type]}</td>
                {(["email", "push"] as const).map((channel) => (
                  <td key={channel} className="text-center">
                    {/* The label makes the whole 44px cell tappable. */}
                    <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        name={`${channel}:${type}`}
                        defaultChecked={current[type][channel]}
                        aria-label={`${typeLabels[type]}: ${channel === "email" ? labels.colEmail : labels.colPush}`}
                        className="h-5 w-5 accent-[var(--accent)]"
                      />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {state?.ok && <p className="mb-2 text-sm text-good">{ok[state.ok]}</p>}
        <button type="submit" disabled={pending} className="btn">
          {pending ? saveLabels.saving : saveLabels.save}
        </button>
      </form>
    </>
  );
}
