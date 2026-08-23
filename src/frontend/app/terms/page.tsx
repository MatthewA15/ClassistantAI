import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalList, Strong, type LegalSection } from "@/components/site/LegalLayout";
import { LEGAL } from "@/data/legal";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The agreement between you and Classistant: what it does, what it will not do, what you are responsible for, and how to leave.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    heading: "This is an agreement",
    body: (
      <>
        <p>
          These terms are a contract between you and {LEGAL.entity} (&ldquo;
          {LEGAL.operatingName}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By finishing
          onboarding or using the assistant, you accept them. If you do not accept them, do not
          use the service.
        </p>
        <p>
          Our{" "}
          <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
            privacy policy
          </Link>{" "}
          forms part of this agreement.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    heading: "Who can use it",
    body: (
      <LegalList
        items={[
          "You must be at least sixteen years old, and old enough to enter a contract where you live.",
          "You must be currently enrolled at a school we support.",
          "You must have a Canadian mobile number that can receive texts and calls.",
          "The Google account you connect must be your own school account, not a shared or departmental one.",
          "You must not be barred from using the service by your school's own IT or academic policy. Checking that is your responsibility, not ours.",
        ]}
      />
    ),
  },
  {
    id: "what-it-is",
    heading: "What Classistant is, and what it is not",
    body: (
      <>
        <p>
          Classistant is an automated assistant that reads your school accounts, builds a
          schedule of your coursework, and contacts you about it by text and, if you opt in, by
          voice call.
        </p>
        <p>It is not any of the following, and you should not treat it as such.</p>
        <LegalList
          items={[
            "It is not affiliated with, endorsed by, or operated by your school, or by Google LLC.",
            "It is not an academic advisor, a registrar, or a source of official information about your program. Your school's own systems always take priority.",
            "It is not a guarantee that you will meet a deadline, pass a course, or receive every notification.",
            "It will not write your assignments, sit your exams, or submit graded work as you.",
          ]}
        />
      </>
    ),
  },
  {
    id: "integrity",
    heading: "Academic integrity",
    body: (
      <>
        <p>
          You remain fully responsible for your own academic conduct. Classistant is a scheduling
          and communication tool, and using it does not excuse you from any rule your institution
          sets.
        </p>
        <p>You must not use Classistant to:</p>
        <LegalList
          items={[
            "Produce work you then submit as your own where your school forbids that.",
            "Send email impersonating anyone other than yourself.",
            "Access an account, course, or portal you are not entitled to access.",
            "Circumvent an academic penalty, an access restriction, or a disciplinary decision.",
          ]}
        />
        <p>
          If your school penalises you over how you used Classistant, that is between you and
          your school.
        </p>
      </>
    ),
  },
  {
    id: "credentials",
    heading: "Your accounts and credentials",
    body: (
      <>
        <p>
          By giving us your school portal credentials, you authorise us to sign in to that portal
          as you and read your own academic information, for the purposes described in the
          privacy policy. You confirm the credentials are yours and that you are allowed to give
          them to us.
        </p>
        <p>
          You are responsible for keeping your Classistant account and your mobile number
          secure, and for telling us promptly if either is compromised. Anything done through
          your account is treated as done by you.
        </p>
        <p>
          If your school blocks automated access, changes its login system, or turns on a
          security control we cannot pass, parts of the service will stop working. That is not a
          breach of this agreement by us.
        </p>
      </>
    ),
  },
  {
    id: "messaging",
    heading: "Texts and calls",
    body: (
      <>
        <p>
          You expressly consent to receive automated text messages about your coursework, and, if
          you enable it, automated voice calls. Frequency depends on your workload and the
          settings you chose. Carrier message and data rates may apply, and we do not cover them.
        </p>
        <p>
          You can withdraw consent at any time by replying <Strong>STOP</Strong> for all
          messages, or <Strong>STOP CALLS</Strong> for calls only. We act on it immediately.
          Withdrawing consent to texts effectively ends the service, since texting is how it
          works.
        </p>
      </>
    ),
  },
  {
    id: "accuracy",
    heading: "Accuracy, and why you still have to pay attention",
    body: (
      <>
        <p>
          Classistant reads syllabi, portal pages, and email written by other people, and those
          sources are frequently wrong, ambiguous, or changed without notice. The assistant will
          sometimes miss a deadline, read a date incorrectly, misjudge the weight of an
          assignment, or fail to notice a change.
        </p>
        <p>
          <Strong>
            You remain solely responsible for knowing and meeting your own academic obligations.
          </Strong>{" "}
          Classistant is a safety net, not a replacement for checking. Verify anything that
          matters against your school&rsquo;s own systems.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    heading: "Availability and changes",
    body: (
      <p>
        We may change, suspend, or discontinue any part of the service. Where a change materially
        reduces what you get, we will give you reasonable notice by text or email. We do not
        promise uninterrupted service, and maintenance, provider outages, and school-side changes
        will cause downtime.
      </p>
    ),
  },
  {
    id: "fees",
    heading: "Fees",
    body: (
      <p>
        Classistant is free during early access. If we introduce fees, you will be told at least
        thirty days beforehand, you will never be charged without agreeing first, and any term
        already underway stays free for students who started it.
      </p>
    ),
  },
  {
    id: "termination",
    heading: "Ending this agreement",
    body: (
      <>
        <p>
          You can leave whenever you like by replying <Strong>DELETE</Strong>, or from{" "}
          <Link href="/delete-my-data" className="font-semibold text-brand-600 hover:underline">
            delete my data
          </Link>
          . Your data is handled as set out in the privacy policy.
        </p>
        <p>
          We may suspend or end your access if you breach these terms, if we are required to by
          law, or if your school asks us to stop accessing its systems. Where circumstances allow,
          we will tell you why.
        </p>
      </>
    ),
  },
  {
    id: "ip",
    heading: "Intellectual property",
    body: (
      <p>
        We own Classistant, its software, its name, and its branding. You own your own content,
        including your coursework and your messages. You grant us only the licence needed to
        operate the service for you, and it ends when your account does.
      </p>
    ),
  },
  {
    id: "warranty",
    heading: "No warranties",
    body: (
      <p>
        To the fullest extent the law allows, the service is provided &ldquo;as is&rdquo; and
        &ldquo;as available&rdquo;, without warranty of any kind, express or implied, including
        merchantability, fitness for a particular purpose, and non-infringement. Some
        jurisdictions do not allow certain exclusions, so parts of this section may not apply to
        you.
      </p>
    ),
  },
  {
    id: "liability",
    heading: "Limitation of liability",
    body: (
      <>
        <p>
          To the fullest extent the law allows, we are not liable for indirect, incidental,
          special, consequential, or punitive damages, or for lost grades, lost academic standing,
          lost opportunities, or missed deadlines, arising from your use of or inability to use
          the service.
        </p>
        <p>
          Our total liability to you for any claim is limited to the greater of the amount you
          paid us in the twelve months before the claim, or one hundred Canadian dollars.
        </p>
        <p>Nothing here limits liability that cannot be limited by law.</p>
      </>
    ),
  },
  {
    id: "indemnity",
    heading: "Indemnity",
    body: (
      <p>
        You agree to indemnify us against claims, losses, and reasonable legal costs arising from
        your breach of these terms, your misuse of the service, or your breach of your
        school&rsquo;s policies.
      </p>
    ),
  },
  {
    id: "law",
    heading: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of {LEGAL.jurisdiction} and the federal laws of
        Canada that apply there. Disputes go to the courts of {LEGAL.jurisdiction}, though you
        keep any right you have to bring a claim where you live or to use a consumer protection
        body.
      </p>
    ),
  },
  {
    id: "general",
    heading: "General",
    body: (
      <>
        <p>
          If part of these terms is found unenforceable, the rest still applies. Our not enforcing
          something is not a waiver of it. You may not transfer this agreement without our
          consent. We may transfer it as part of a merger or sale, on notice to you.
        </p>
        <p>
          We may update these terms. Material changes come with at least thirty days&rsquo;
          notice by text or email, and continuing to use the service after that means you accept
          them.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    heading: "Contact",
    body: (
      <p>
        Questions about these terms go to{" "}
        <a href={`mailto:${LEGAL.contactEmail}`} className="font-semibold text-brand-600 hover:underline">
          {LEGAL.contactEmail}
        </a>
        .<br />
        {LEGAL.entity}, {LEGAL.address}
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of service"
      lastUpdated={LEGAL.lastUpdated}
      intro={
        <>
          The short version: Classistant helps you keep track of your semester, it is not your
          school, it will sometimes get something wrong, and your grades are still your
          responsibility. The long version is below, and it is worth reading the accuracy section.
        </>
      }
      sections={SECTIONS}
    />
  );
}
