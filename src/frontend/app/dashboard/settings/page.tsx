import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHead } from "@/components/dashboard/chrome";
import { NotificationsForm } from "@/components/dashboard/NotificationsForm";
import { ProfileForm } from "@/components/dashboard/ProfileForm";
import { SignOutButton } from "@/components/dashboard/nav";
import { Card, CardHead, DataRow, buttonClass } from "@/components/dashboard/ui";
import { readNotifications } from "@/data/notifications";
import { getSchool } from "@/data/schools";
import { getSession } from "@/lib/authSession";
import { getAccount } from "@/lib/users";

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

/**
 * Everything about the account that is not access.
 *
 * ## Why so much of this page is read-only
 *
 * Three of the four facts in the profile card cannot be edited here, and each
 * one is a deliberate refusal rather than a feature that has not been built:
 *
 *   the number   proven by an SMS round trip. A text field that overwrote it
 *                would hand a student a number nobody delivered a code to,
 *                which is the whole thing that round trip exists to prevent.
 *   the address  proven by the Google exchange, and it is also the key the
 *                connector's endpoints are addressed by. It changes by
 *                connecting a different Google account, which is a flow.
 *   the school   determined by the address domain, and checked against it in
 *                two places. A dropdown here could put a Mount Royal student on
 *                an Alberta theme with an Alberta portal and no error anywhere.
 *
 * Saying so on the page is the part that matters. A greyed-out field with no
 * explanation reads as broken; a value with one line saying what would change
 * it reads as a decision, which is what it is.
 */
export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/signin");

  const account = await getAccount(session.uid);
  if (!account) redirect("/onboarding");

  const school = account.schoolId ? getSchool(account.schoolId) : undefined;
  const prefs = readNotifications(account.notifications);

  return (
    <>
      <PageHead
        title="Settings"
        lead="Who Classistant thinks you are, and how loud it is allowed to be."
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHead title="You" />

          <div className="border-b border-line-soft pb-4">
            <ProfileForm name={account.name ?? account.email?.split("@")[0] ?? "you"} />
          </div>

          <dl className="pt-1">
            <DataRow
              label="Mobile number"
              value={account.phoneNumber ?? "Not set"}
              mono
              hint="Your login, and where the texts go. To move to a new number, sign out and set up again on it."
            />
            <DataRow
              label="School email"
              value={account.email ?? "Not connected"}
              mono
              hint="Proven when you connected Google. Change it by connecting a different school account."
              action={
                <Link href="/dashboard/access" className={buttonClass("secondary", "sm")}>
                  Access
                </Link>
              }
            />
            <DataRow
              label="School"
              value={school?.name ?? "Not set"}
              hint={
                school
                  ? `Taken from your @${school.emailDomain} address, so it follows the account rather than being picked.`
                  : undefined
              }
            />
            <DataRow
              label="Member since"
              value={
                account.createdAt
                  ? new Date(account.createdAt).toLocaleDateString("en-CA", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "Unknown"
              }
            />
          </dl>
        </Card>

        <Card>
          <CardHead
            title="Messages and calls"
            lead="Classistant reaches you by text, and escalates to a call when a deadline is close and you have not answered."
          />
          <NotificationsForm prefs={prefs} marketing={account.marketingConsent} />
        </Card>

        <Card>
          <CardHead
            title="Your data"
            lead="Everything we hold about you, and how to get it back or get rid of it."
          />

          <ul className="flex flex-col gap-2.5">
            {[
              "Your profile, your school, and the consent you gave at signup.",
              "Your school portal password, encrypted under a key we cannot open.",
              "Google's refresh token, encrypted under a different key we also cannot open.",
              "The courses, deadlines, and grades it has found, and everything it has texted you.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[0.86rem] leading-[1.55] text-ink-800">
                <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                {line}
              </li>
            ))}
          </ul>

          <p className="mt-5 text-[0.84rem] leading-[1.6] text-body">
            Under PIPEDA you can ask for a copy of all of it, or ask us to destroy any part of
            it, and we have to do both. Email{" "}
            <a
              href="mailto:privacy@classistant.ca"
              className="font-semibold text-brand-600 hover:underline"
            >
              privacy@classistant.ca
            </a>{" "}
            for a copy, or use the page below, which writes the request for you.
          </p>
        </Card>

        {/*
          The danger zone, and it is a ring rather than a red panel.

          --color-alert is functional in this system: it marks a step that went
          wrong. A card filled with it announces a failure, and nothing on this
          part of the page has failed. The ring says "be careful" without
          saying "something is broken", which is the distinction the palette
          rules in docs/design/02 are protecting.
        */}
        <Card tone="alert">
          <CardHead
            title="Leaving"
            lead="Signing out ends the session on every device, not just this one. Deleting is permanent and we cannot undo it."
          />

          <div className="flex flex-wrap gap-3">
            <SignOutButton className={buttonClass("secondary")}>
              Sign out everywhere
            </SignOutButton>

            {/*
              A link, not a button that fires at our backend.

              components/legal/DeletionRequest.tsx explains why the deletion
              flow is a composed email rather than a click: a request that
              erases a semester of coursework and a stored school credential
              should not be one mis-click, and the address it is sent from is
              corroboration we would otherwise have to invent a confirmation
              step to get. That reasoning does not weaken now that there is a
              session behind the click; it is a different argument, about the
              size of the thing being destroyed, and it still holds.

              What the session does buy is that the page can be reached from
              here, already knowing who is asking.
            */}
            <Link href="/delete-my-data" className={buttonClass("danger")}>
              Delete my data
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
