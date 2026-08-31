"use client";

import { useActionState, useEffect, useState } from "react";

import { saveNotifications } from "@/app/dashboard/actions";
import { SaveState, Switch, buttonClass } from "@/components/dashboard/ui";
import { HOURS, formatHour, type NotificationPrefs } from "@/data/notifications";
import { cn } from "@/lib/cn";

/**
 * When Classistant is allowed to interrupt.
 *
 * The access switches govern what it may read. These govern what a student
 * actually experiences, which is a phone buzzing, and they are the only
 * controls in the product that are true in the plain sense: no scope, no token,
 * and no cooperation from Google is involved in a message simply not being
 * sent. See the header of data/notifications.ts.
 */
export function NotificationsForm({
  prefs,
  marketing,
}: {
  prefs: NotificationPrefs;
  marketing: boolean;
}) {
  const [state, action, saving] = useActionState(saveNotifications, null);

  const [quiet, setQuiet] = useState(prefs.quietStart !== null && prefs.quietEnd !== null);
  const [start, setStart] = useState(prefs.quietStart ?? 22);
  const [end, setEnd] = useState(prefs.quietEnd ?? 8);
  const [calls, setCalls] = useState(prefs.calls);
  const [digest, setDigest] = useState(prefs.digestHour);
  const [marketingOn, setMarketingOn] = useState(marketing);

  /*
   * The browser's own zone, resolved on the client and submitted as a field.
   *
   * It cannot be read on the server: the request carries no timezone, and the
   * only things that correlate with one are the IP address and the phone
   * number, both of which are wrong for exactly the students most likely to
   * care -- somebody from Toronto studying in Alberta would be woken an hour
   * early by the area code and half a country off by a campus VPN.
   *
   * Seeded from the stored value so the first render is stable and hydration
   * has nothing to reconcile, then corrected in an effect once the browser can
   * be asked. A student who moves provinces gets the new zone the next time
   * they save.
   */
  const [timezone, setTimezone] = useState(prefs.timezone);
  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) setTimezone(zone);
    } catch {
      // No Intl, or a browser that will not name the zone. The stored value
      // stands, which is the last one that worked.
    }
  }, []);

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="timeZone" value={timezone} />

      <div className="flex flex-col gap-2.5">
        <Switch
          checked={quiet}
          onChange={() => setQuiet((v) => !v)}
          title="Quiet hours"
          detail="Nothing is sent inside this window. Anything it finds waits until the window ends."
        />

        {/*
          The two pickers are inside the switch's own block rather than beside
          it, and they only render when it is on. Two dropdowns greyed out under
          an off switch is a control that looks broken; the switch and its
          window are one setting expressed in three inputs.
        */}
        {quiet ? (
          <div className="ml-1 flex flex-wrap items-end gap-3 rounded-xl bg-paper p-4 ring-1 ring-line">
            <HourSelect
              id="quiet-start"
              name="quietStart"
              label="From"
              value={start}
              onChange={setStart}
            />
            <HourSelect id="quiet-end" name="quietEnd" label="Until" value={end} onChange={setEnd} />
            <p className="w-full text-[0.78rem] leading-[1.55] text-body-soft">
              {start === end
                ? "Same hour for both means no quiet window at all."
                : `Quiet from ${formatHour(start)} to ${formatHour(end)}, ${zoneLabel(timezone)}.`}
            </p>
          </div>
        ) : (
          // Off is stored as two nulls, and an unrendered select submits
          // nothing, which readHour would treat as "keep the old value". These
          // say off explicitly.
          <>
            <input type="hidden" name="quietStart" value="off" />
            <input type="hidden" name="quietEnd" value="off" />
          </>
        )}

        <Switch
          name="calls"
          checked={calls}
          onChange={() => setCalls((v) => !v)}
          title="Phone calls"
          detail="Only for a deadline it has already texted you about twice and heard nothing back on."
        />

        <Switch
          checked={digest !== null}
          onChange={() => setDigest((v) => (v === null ? 8 : null))}
          title="Daily summary"
          detail="One text a day with everything coming up, instead of a message per thing it finds."
        />

        {digest !== null ? (
          <div className="ml-1 flex flex-wrap items-end gap-3 rounded-xl bg-paper p-4 ring-1 ring-line">
            <HourSelect
              id="digest-hour"
              name="digestHour"
              label="Send it at"
              value={digest}
              onChange={setDigest}
            />
            <p className="w-full text-[0.78rem] leading-[1.55] text-body-soft">
              {quiet
                ? "A summary due inside your quiet hours is held until the window ends, not skipped."
                : `Sent around ${formatHour(digest)}, ${zoneLabel(timezone)}.`}
            </p>
          </div>
        ) : (
          <input type="hidden" name="digestHour" value="off" />
        )}
      </div>

      <div className="border-t border-line-soft pt-5">
        <Switch
          name="marketing"
          checked={marketingOn}
          onChange={() => setMarketingOn((v) => !v)}
          title="Email me about new features"
          detail="Occasional email, never a text. Turning this off changes nothing about how the assistant works."
        />
      </div>

      {/*
        The one thing on this page a preference cannot switch off.

        Texts have no toggle here, and a settings page that quietly omitted that
        would be hiding the answer to the obvious next question. STOP is the
        control, it works from the student's own handset, and it is the one A2P
        registration requires to be honoured, so naming it here is both honest
        and the thing a student actually wants to know.
      */}
      <p className="rounded-xl bg-sky-50 p-4 text-[0.84rem] leading-[1.6] text-ink-800 ring-1 ring-sky-200">
        There is no switch for texts themselves, because texts are the product. Reply{" "}
        <span className="font-semibold">STOP</span> to any message to end them for good, or{" "}
        <span className="font-semibold">STOP CALLS</span> to keep the texts and drop the calls.
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
        <button type="submit" disabled={saving} className={buttonClass("primary")}>
          {saving ? "Saving..." : "Save preferences"}
        </button>
        <SaveState state={state} />
      </div>
    </form>
  );
}

/** "America/Toronto" -> "Toronto time". The zone id is precise and unreadable;
 *  the city is the half a student recognises as their own. */
function zoneLabel(timezone: string): string {
  const city = timezone.split("/").pop()?.replace(/_/g, " ");
  return city ? `${city} time` : "your local time";
}

function HourSelect({
  id,
  name,
  label,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: number;
  onChange: (hour: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8rem] font-semibold text-ink-900">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        className={cn(
          "rounded-xl border border-line bg-white px-3.5 py-2.5 text-[0.9rem] font-semibold text-ink-900 outline-none transition-colors",
          "focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12",
        )}
      >
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {formatHour(hour)}
          </option>
        ))}
      </select>
    </div>
  );
}
