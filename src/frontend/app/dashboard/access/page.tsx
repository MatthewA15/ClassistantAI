import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AccessSwitches } from "@/components/dashboard/AccessSwitches";
import { PageHead } from "@/components/dashboard/chrome";
import { ReconnectGoogle } from "@/components/dashboard/GoogleConnection";
import { PortalLoginForm } from "@/components/dashboard/PortalLoginForm";
import { Badge, Card, CardHead, DataRow } from "@/components/dashboard/ui";
import { readAccess } from "@/data/access";
import { getSchool } from "@/data/schools";
import { getSession } from "@/lib/authSession";
import { getAccount, hasPortalPassword } from "@/lib/users";

export const metadata: Metadata = { title: "Access" };

export const dynamic = "force-dynamic";

/**
 * What Classistant can reach, and how it gets in.
 *
 * Three cards, and their order is the point. They run from the control a
 * student is most likely to have come here to use, to the one they are least
 * likely to and would be most alarmed to find first:
 *
 *  1. The switches. Ours to honour, changeable in one press, no consequences
 *     outside this product.
 *  2. The Google connection. Google's to grant, and changing it means leaving
 *     the site for a consent screen.
 *  3. The portal password. Sealed, unreadable to us, and replacing it is a
 *     write nothing can undo.
 *
 * ## The two ways in are genuinely different and the page has to say so
 *
 * Google is an OAuth grant covering mail, calendar and files. The school portal
 * is a password typed into the school's own login page by a browser running at
 * 3am. They are separate systems, they fail separately, and a student who turns
 * every Google switch off has not stopped the portal checks. That last sentence
 * is the one most likely to be got wrong by someone using this page, so it is
 * on the page.
 */
export default async function AccessPage() {
  const session = await getSession();
  if (!session) redirect("/signin");

  const account = await getAccount(session.uid);
  if (!account) redirect("/onboarding");

  const portalSealed = await hasPortalPassword(session.uid);
  const school = account.schoolId ? getSchool(account.schoolId) : undefined;

  return (
    <>
      <PageHead
        title="Access"
        lead="What Classistant is allowed to touch, and the two logins it uses to get there."
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHead
            title="What it can touch"
            lead="Switch off anything you would rather Classistant left alone. It takes effect on the next run."
          />
          <AccessSwitches access={readAccess(account.access)} />
        </Card>

        <Card>
          <CardHead
            title="Google"
            lead="Your school mail, calendar, and course files."
            action={
              account.googleConnected ? (
                <Badge tone="ok">Connected</Badge>
              ) : (
                <Badge tone="alert">Not connected</Badge>
              )
            }
          />

          <dl>
            <DataRow
              label="Signed in as"
              value={account.email ?? "Not connected"}
              mono
              hint={
                school
                  ? `Your ${school.name} account. Changing the address means connecting a different one.`
                  : undefined
              }
            />
            <DataRow
              label="Granted"
              value={
                account.googleConnectedAt
                  ? new Date(account.googleConnectedAt).toLocaleDateString("en-CA", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "Not yet"
              }
              hint="Reconnect if you removed Classistant at Google, or if it has stopped being able to read your mail."
              action={
                <ReconnectGoogle
                  schoolId={account.schoolId}
                  email={account.email}
                  label={account.googleConnected ? "Reconnect" : "Connect"}
                />
              }
            />
          </dl>

          {/*
            The one thing on this page that genuinely revokes something, and it
            does not live here.

            The switches above bind Classistant; this ends the grant itself. It
            is deliberately a link out rather than a button, because we cannot
            do it: the token is Google's, and the only place it can be withdrawn
            is the account that issued it. A button here that called some
            endpoint of ours would be claiming otherwise.
          */}
          <p className="mt-5 rounded-xl bg-paper p-4 text-[0.84rem] leading-[1.6] text-ink-800 ring-1 ring-line">
            To take the access back from Google rather than from us, remove Classistant in your{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-brand-600 hover:underline"
            >
              Google account permissions
            </a>
            . That ends it entirely, and this page will show as not connected the next time you
            open it.
          </p>
        </Card>

        <Card>
          <CardHead
            title={school ? `${school.short ?? school.name} portal` : "School portal"}
            lead="Where posted grades and course files live. Google does not get Classistant in there, so it signs in with your own portal login while you are asleep."
            action={
              portalSealed ? <Badge tone="ok">Sealed</Badge> : <Badge tone="alert">Missing</Badge>
            }
          />

          <PortalLoginForm username={account.schoolUsername} hasPassword={portalSealed} />

          {/* The sentence most likely to be got wrong by someone on this page.
              The switches above are Google's scopes; the portal is a password.
              Turning all five off does not stop this, and a student who
              believed otherwise would be wrong about the thing they most cared
              about getting right. */}
          <p className="mt-5 rounded-xl bg-paper p-4 text-[0.84rem] leading-[1.6] text-ink-800 ring-1 ring-line">
            The switches at the top of this page do not reach the portal. They cover your Google
            account, and this is a separate login. To stop the portal checks, ask us to destroy
            the password at{" "}
            <Link href="/delete-my-data" className="font-semibold text-brand-600 hover:underline">
              delete my data
            </Link>
            , which has an option for exactly that and leaves the rest of your account alone.
          </p>
        </Card>

        <p className="text-[0.84rem] leading-[1.6] text-body-soft">
          Wondering exactly what each switch covers, or where any of this is stored?{" "}
          <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
            The privacy policy
          </Link>{" "}
          names every scope and every service that touches your data.
        </p>
      </div>
    </>
  );
}
