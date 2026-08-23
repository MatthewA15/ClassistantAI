import "server-only";

import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

/**
 * School portal password storage.
 *
 * This is *reversible encryption, not hashing*. The agent has to replay the
 * password into the school's LMS overnight, so a one-way hash is not an option
 * here the way it would be for a password we ourselves authenticate against.
 * That constraint is the whole reason this file exists instead of a bcrypt call.
 *
 * Secret Manager rather than a ciphertext blob in Firestore, for three reasons
 * (docs/design/12):
 *  - it is already how the connector stores per-user refresh tokens (ADR-0002),
 *    so credentials have one storage model and one audit story, not two;
 *  - every individual read is audit logged, which is the only way to ever show
 *    that an unattended agent touched a credential only when it should have;
 *  - no key handling code of our own to get wrong.
 *
 * The trade is cost and sprawl: one secret per user bills per active version per
 * month, which is nothing at current size and a real line item at tens of
 * thousands of students, and there is a per-project secret quota to check before
 * scaling. Envelope encryption under a single Cloud KMS key is flat-cost and is
 * where this should go if that day arrives -- which is why every caller goes
 * through the two functions below and nothing else knows where the bytes live.
 */

let client: SecretManagerServiceClient | undefined;

function secrets(): SecretManagerServiceClient {
  client ??= new SecretManagerServiceClient();
  return client;
}

function projectId(): string {
  const id = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
  if (!id) throw new Error("GOOGLE_CLOUD_PROJECT is not set");
  return id;
}

/** Matches the connector's convention in app/services/secrets.py. The Google
 *  `sub` is a stable numeric id, so it is safe in a secret name. */
function secretId(userId: string): string {
  return `user-${userId}-portal-password`;
}

/** The pointer we keep in Firestore. Never the password itself. */
export function secretName(userId: string): string {
  return `projects/${projectId()}/secrets/${secretId(userId)}`;
}

/**
 * Writes the password and returns the resource name to store as a reference.
 *
 * Re-onboarding or a password change adds a new version rather than replacing
 * one, so a student who mistypes and retries does not destroy the working value
 * until the new one is confirmed.
 */
export async function storePortalPassword(
  userId: string,
  password: string,
): Promise<string> {
  const parent = `projects/${projectId()}`;
  const name = secretName(userId);

  try {
    await secrets().createSecret({
      parent,
      secretId: secretId(userId),
      secret: { replication: { automatic: {} } },
    });
  } catch (err: unknown) {
    // 6 = ALREADY_EXISTS. Expected on every re-onboard; anything else is real.
    if ((err as { code?: number }).code !== 6) throw err;
  }

  await secrets().addSecretVersion({
    parent: name,
    payload: { data: Buffer.from(password, "utf8") },
  });

  return name;
}

/**
 * Reads the current password back. Returns null when nothing is stored, so the
 * caller can send the student through onboarding rather than crash.
 *
 * Nothing in the web app calls this today -- the agent does, and it is here so
 * the read path lives beside the write path and both change together.
 */
export async function getPortalPassword(userId: string): Promise<string | null> {
  try {
    const [version] = await secrets().accessSecretVersion({
      name: `${secretName(userId)}/versions/latest`,
    });
    const data = version.payload?.data;
    if (!data) return null;
    return Buffer.from(data as Uint8Array).toString("utf8");
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 5) return null; // 5 = NOT_FOUND
    throw err;
  }
}
