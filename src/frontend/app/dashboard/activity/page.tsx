import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { PageHead } from "@/components/dashboard/chrome";
import { Card } from "@/components/dashboard/ui";
import { readNotifications } from "@/data/notifications";
import { ACTIVITY_PAGE_SIZE, getActivity } from "@/lib/activity";
import { getSession } from "@/lib/authSession";
import { getAccount } from "@/lib/users";

export const metadata: Metadata = { title: "Activity" };

export const dynamic = "force-dynamic";

/**
 * The task history.
 *
 * ## This page will be empty for everyone until the agent writes to Firestore
 *
 * `users/{uid}/activity` has no writer in this repository. The agent does the
 * work, so the agent records it, and the agent is a different codebase. The
 * read side and the document shape are in lib/activity.ts, written first so
 * that the writer has a contract to write against rather than inventing one.
 *
 * The empty state is therefore the state a real student sees today, and it must
 * not be papered over with sample rows. A history is a record of what a product
 * did with somebody's actual school email; seeded demo entries in it are a
 * false statement about that, on the one page whose entire job is to be a
 * truthful account of what happened. See docs/design/20-dashboard.md.
 */
export default async function ActivityPage() {
  const session = await getSession();
  if (!session) redirect("/signin");

  const [account, entries] = await Promise.all([
    getAccount(session.uid),
    getActivity(session.uid),
  ]);

  const prefs = readNotifications(account?.notifications, account?.timeZone);

  return (
    <>
      <PageHead
        title="Activity"
        lead="Everything Classistant has done on your account, newest first. Times are in your own timezone."
      />

      <Card>
        <ActivityFeed
          entries={entries}
          timezone={prefs.timezone}
          // A full page is the only signal available that there is more behind
          // it. Asking Firestore for a count as well would double the read to
          // answer a question the footer can ask honestly without it.
          truncated={entries.length >= ACTIVITY_PAGE_SIZE}
        />
      </Card>
    </>
  );
}
