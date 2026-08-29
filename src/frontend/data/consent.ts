/**
 * The exact wording of every consent checkbox.
 *
 * This file exists so the words on screen and the words in the stored consent
 * record cannot drift apart. Both read from here.
 *
 * Why that matters: `acceptTerms: true` is not evidence of anything. Under CASL
 * and for Twilio A2P registration what has to be producible later is *what the
 * student was shown at the moment they agreed*, and marketing copy gets edited.
 * If the record stores a boolean and the checkbox text changes next term, every
 * consent already on file silently starts referring to words nobody ever saw.
 *
 * So: editing a string here is editing a legal record going forward. Add a new
 * key and bump `version` rather than rewording an existing one in place if the
 * meaning changes -- existing records keep pointing at the version they were
 * captured under.
 */

export const CONSENT_VERSION = "2026-08-23";

export const CONSENT_COPY = {
  terms: {
    title: "I accept the terms and privacy policy",
    body: "Including that Classistant can read course mail and write to your calendar.",
  },
  marketing: {
    title: "Send me product emails",
    body: "Occasional updates about new features. Nothing to do with your coursework, and you can opt out any time.",
  },
  sms: {
    title: "Text me about my coursework",
    body: "Automated texts from Classistant about your schoolwork. Message and data rates may apply. Reply STOP to end at any time.",
  },
} as const;

export type ConsentKey = keyof typeof CONSENT_COPY;

/** The single string stored alongside a consent record. */
export function consentWording(key: ConsentKey): string {
  const { title, body } = CONSENT_COPY[key];
  return `[${CONSENT_VERSION}] ${title}. ${body}`;
}
