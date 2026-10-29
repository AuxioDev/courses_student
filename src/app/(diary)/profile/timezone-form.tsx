"use client";

import { useActionState } from "react";
import { updateTimezone } from "@/app/actions";

export function TimezoneForm({ current, timezones }: { current: string; timezones: string[] }) {
  const [state, action, pending] = useActionState(updateTimezone, undefined);
  const options = timezones.includes(current) ? timezones : [current, ...timezones];
  return (
    <form action={action} className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Timezone</span>
        <select name="timezone" defaultValue={current} className="field">
          {options.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="text-sm text-good">{state.ok}</p>}
      <button type="submit" disabled={pending} className="btn">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
