import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHead } from "@/components/dashboard/chrome";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { Badge, Card, CardHead, buttonClass } from "@/components/dashboard/ui";
import { ACCESS_ITEMS, readAccess } from "@/data/access";
import { readNotifications } from "@/data/notifications";
import { getSchool } from "@/data/schools";
import { getActivity } from "@/lib/activity";
import { listSchools } from "@/lib/schools";
import { getSession } from "@/lib/authSession";
import { getAccount, hasPortalPassword } from "@/lib/users";

export const metadata: Metadata = { title: "Overview" };

export const dynamic = "force-dynamic";

/** How many rows the overview previews. Enough to show the feed is alive and
 *  what a row looks like, few enough that the four status tiles above it stay
 *  the thing the page is about. */
const PREVIEW = 5;

/**
 * The signed-in home.
 *
 * One question: is everything still set up and working. Four tiles answer it in
 * the shape a student would ask it -- where do the texts go, which school
 * account, can it get into the portal, what is it allowed to touch -- and each
 * one links to the page that can change it.
 *
 * Nothing is editable on this page on purpose. A dashboard where the summary is
 * also a control is a dashboard where a student changes something while
 * skimming, and where each of the other three pages has a second, slightly
 * different version of itself living here to be kept in sync.
 */
export default async function OverviewPage() {
  // The layout has already established that there is a session and a finished
  // account, and redirects otherwise. This read is for the wider record: the
  // layout's `getUser` deliberately returns the six fields onboarding needs and
  // no more. See the note above AccountRecord in lib/users.ts.
  const session = await getSession();
  if (!session) redirect("/signin");

  const account = await getAccount(session.uid);
  if (!account) redirect("/onboarding");

  const [portalSealed, activity] = await Promise.all([
    hasPortalPassword(session.uid),
    getActivity(session.uid, PREVIEW),
  ]);

  const school = account.schoolId
    ? getSchool(await listSchools(), account.schoolId)
    : undefined;
  const access = readAccess(account.access);
  const on = ACCESS_ITEMS.filter((item) => access[item.key]);
  const prefs = readNotifications(account.notifications, account.timeZone);
  const firstName = (account.name ?? "").split(" ")[0];

  return (
    <>
      <PageHead
        title={firstName ? `Hey, ${firstName}` : "Your account"}
        lead={
          school
            ? `Classistant is watching ${school.name} for you and texting ${account.phoneNumber}.`
            : "Classistant is watching your school account for you."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Tile
          label="Texts go to"
          value={account.phoneNumber ?? "Not set"}
          mono
          badge={<Badge tone="ok">Verified</Badge>}
          note="Verified by a code we sent to it. This is also your login."
          href="/dashboard/settings"
          hrefLabel="Notification settings"
        />

        <Tile
          label="School account"
          value={account.email ?? "Not connected"}
          mono
          badge={
            account.googleConnected ? (
              <Badge tone="ok">Connected</Badge>
            ) : (
              <Badge tone="alert">Not connected</Badge>
            )
          }
          note={
            account.googleConnectedAt
              ? `Connected ${new Date(account.googleConnectedAt).toLocaleDateString("en-CA", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}.`
              : "Gmail, Calendar, Drive and Docs, under the switches you set."
          }
          href="/dashboard/access"
          hrefLabel="Manage access"
        />

        <Tile
          label="Portal login"
          value={account.schoolUsername ?? "Not set"}
          mono
          badge={
            portalSealed ? <Badge tone="ok">Sealed</Badge> : <Badge tone="alert">Missing</Badge>
          }
          note={
            portalSealed
              ? "Your password is encrypted under a key we can lock and cannot open."
              : "Without it, Classistant cannot check your portal overnight. Classy will text you a link when it needs it, or add it now."
          }
          href="/dashboard/access"
          // "Missing" is the normal state for a new account now, not a broken
          // one: onboarding stopped asking for the portal login (#54), so this
          // tile is where a student who wants to get ahead of the text can.
          hrefLabel={portalSealed ? "Replace it" : "Add it"}
        />

        <Tile
          label="What it can touch"
          value={`${on.length} of ${ACCESS_ITEMS.length} on`}
          badge={
            on.length === ACCESS_ITEMS.length ? (
              <Badge tone="neutral">Everything</Badge>
            ) : (
              <Badge tone="warn">Narrowed</Badge>
            )
          }
          note={
            on.length === ACCESS_ITEMS.length
              ? "Everything you granted at Google is in use."
              : `Off: ${ACCESS_ITEMS.filter((item) => !access[item.key])
                  .map((item) => item.label.toLowerCase())
                  .join(", ")}.`
          }
          href="/dashboard/access"
          hrefLabel="Change what it can touch"
        />
      </div>

      <Card className="mt-4">
        <CardHead
          title="Latest activity"
          lead="Every deadline it found, event it added, and night it checked your portal."
          action={
            activity.length > 0 ? (
              <Link href="/dashboard/activity" className={buttonClass("secondary", "sm")}>
                See all
              </Link>
            ) : null
          }
        />
        {/* Neither filterable nor truncated, and for the same reason: this is a
            five row preview with a "See all" beside it. Chips would filter five
            rows while looking like they filter a history, and the note about
            older entries would be telling a student something the link already
            says. */}
        <ActivityFeed
          entries={activity}
          timezone={prefs.timezone}
          truncated={false}
          filterable={false}
        />
      </Card>
    </>
  );
}

/**
 * One status tile.
 *
 * Local to this page rather than in components/dashboard/ui.tsx, because it is
 * one composition of a Card and a Badge used in exactly one place. Promoting it
 * would add a shared component whose only caller defines what it looks like,
 * which is how a design system fills up with things nobody can safely change.
 */
function Tile({
  label,
  value,
  badge,
  note,
  href,
  hrefLabel,
  mono = false,
}: {
  label: string;
  value: string;
  badge: React.ReactNode;
  note: string;
  href: string;
  hrefLabel: string;
  mono?: boolean;
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-body-soft">
          {label}
        </p>
        {badge}
      </div>

      <p
        className={
          mono
            ? "mt-2.5 break-all font-mono text-[1rem] text-ink-900"
            : "mt-2.5 text-[1.05rem] font-extrabold text-ink-900"
        }
      >
        {value}
      </p>

      <p className="mt-2 flex-1 text-[0.82rem] leading-[1.6] text-body">{note}</p>

      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1 self-start text-[0.84rem] font-semibold text-brand-600 hover:underline"
      >
        {hrefLabel}
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </Card>
  );
}
