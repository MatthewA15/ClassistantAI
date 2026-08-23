import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DeletionRequest } from "@/components/legal/DeletionRequest";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { LegalList, Strong } from "@/components/site/LegalLayout";
import { Container } from "@/components/ui/primitives";
import { LEGAL } from "@/data/legal";

export const metadata: Metadata = {
  title: "Delete my data",
  description:
    "Send one email and Classistant erases your account, your stored portal password, and everything the assistant learned about your semester.",
};

/**
 * The destination for the footer's "Delete my data" link, which used to be a
 * bare mailto:. An empty compose window puts the work on the student at the
 * moment they are least inclined to do any: they have to guess what we need,
 * we get a request we cannot match to an account, and the erasure they asked
 * for turns into a thread. This page writes the email instead, then says what
 * happens after they send it.
 *
 * Deliberately not a numbered legal document like /privacy and /terms. This is
 * a task, and the sticky contents rail those pages use would push the one
 * control that matters below the fold.
 */

function Step({ n, title, lead, children }: { n: number; title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative pb-14 pl-0 sm:pl-16">
      {/* Number sits in the gutter on desktop and above the heading on phones,
          where a 4rem indent would eat a third of the line. */}
      <span
        aria-hidden="true"
        className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-brand-600 font-display text-[1.05rem] font-extrabold text-white sm:absolute sm:left-0 sm:top-0 sm:mb-0"
      >
        {n}
      </span>
      <h2 className="text-[1.6rem] font-extrabold leading-[1.15] text-ink-900 sm:text-[2rem]">
        {title}
      </h2>
      {lead ? <p className="mt-3 max-w-xl text-[1.02rem] leading-[1.7] text-body">{lead}</p> : null}
      {children ? <div className="mt-7">{children}</div> : null}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-6 sm:p-7">
      <h3 className="text-[1.05rem] font-bold text-ink-900">{title}</h3>
      <div className="mt-4 text-[0.95rem] leading-[1.7] text-body">{children}</div>
    </div>
  );
}

export default function DeleteMyDataPage() {
  return (
    <>
      <Header />
      <main id="main" className="bg-white">
        <div className="border-b border-line bg-paper py-14 sm:py-20">
          <Container>
            <h1 className="max-w-3xl text-[2.4rem] font-extrabold leading-[1.06] text-ink-900 sm:text-[3.4rem]">
              One email and we forget you.
            </h1>
            <p className="mt-6 max-w-xl text-[1.08rem] leading-[1.65] text-body">
              No form to argue with, no retention screen, no offer to pause instead. Fill in three
              fields, send the message this page writes, and it is done.
            </p>
          </Container>
        </div>

        <Container className="py-14 sm:py-20">
          <div className="max-w-3xl">
            <Step
              n={1}
              title="Write the request"
              lead="Everything we need to find your account and act on it without writing back to ask."
            >
              <DeletionRequest />
            </Step>

            <Step
              n={2}
              title="We check it is you"
              lead={
                <>
                  Within one business day you get a reply at your school address asking you to
                  confirm. That step exists because the same email that erases your semester would
                  otherwise erase someone else&rsquo;s, sent by anyone who knows your name.
                </>
              }
            />

            <Step
              n={3}
              title="It is gone"
              lead={
                <>
                  Once you confirm, deletion runs the same week. The outside limit is{" "}
                  <Strong>thirty days</Strong>, which is the deadline PIPEDA sets, and we email you
                  a list of what was removed when it is finished.
                </>
              }
            />
          </div>

          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <Panel title="What goes">
              <LegalList
                items={[
                  <>
                    Your <Strong>school portal password</Strong>, destroyed immediately rather than
                    on a retention schedule.
                  </>,
                  "Your account, your name, your email address, your mobile number, and your preferences.",
                  "Every course, deadline, exam, and grade the assistant collected.",
                  "Every text and every call record between you and the assistant.",
                  "Calendar events we created stay in your Google Calendar, because they are yours. Delete them there if you want them gone.",
                ]}
              />
            </Panel>

            <Panel title="What survives, and why">
              <LegalList
                items={[
                  "A record that you asked for deletion and that we did it. Without it we cannot prove we honoured the request.",
                  "Anything a law requires us to keep, for exactly as long as it requires.",
                  "Counts with no identifiers in them, such as how many accounts closed in a month.",
                  "Encrypted backups roll over on a fourteen day cycle, so a copy can persist there briefly. It is never read back except to recover a whole system failure.",
                ]}
              />
            </Panel>
          </div>

          <div className="mt-14 max-w-3xl border-t border-line pt-12">
            <h2 className="text-[1.6rem] font-extrabold leading-[1.15] text-ink-900">
              If you want it stopped this second
            </h2>
            <p className="mt-3 text-[1.02rem] leading-[1.7] text-body">
              These take effect immediately and need nobody at our end.
            </p>
            <div className="mt-6 text-[0.97rem] leading-[1.75] text-body">
              <LegalList
                items={[
                  <>
                    Text <Strong>DELETE</Strong> to the assistant. It starts this same flow from
                    your phone, and your number alone identifies the account.
                  </>,
                  <>
                    Text <Strong>STOP</Strong> to end every message, or{" "}
                    <Strong>STOP CALLS</Strong> to keep texts and end voice calls.
                  </>,
                  <>
                    Revoke our Google access at{" "}
                    <a
                      href="https://myaccount.google.com/permissions"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-brand-600 hover:underline"
                    >
                      your Google permissions page
                    </a>
                    . Calendar writes and email scanning stop the moment you do, without asking us.
                  </>,
                ]}
              />
            </div>

            <p className="mt-8 text-[0.95rem] leading-[1.7] text-body-soft">
              Want a copy of your data before it goes, or a correction instead of a deletion? Same
              address:{" "}
              <a
                href={`mailto:${LEGAL.privacyEmail}`}
                className="font-semibold text-brand-600 hover:underline"
              >
                {LEGAL.privacyEmail}
              </a>
              . If we get it wrong you can complain to the Office of the Privacy Commissioner of
              Canada. The full picture of what we hold is in the{" "}
              <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
                privacy policy
              </Link>
              .
            </p>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
