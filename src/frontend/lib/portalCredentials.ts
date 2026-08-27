import "server-only";

import { storeCredential } from "@/lib/credentials";
import { recordSchoolUsername } from "@/lib/users";

/**
 * School portal credentials: the one place that knows where each half goes.
 *
 * This is *reversible encryption, not hashing*. The agent has to replay the
 * password into the school's LMS overnight, so a one-way hash is not available
 * to us the way it would be for a password we authenticate against ourselves.
 * That constraint is the whole reason this file exists instead of a bcrypt call.
 *
 * It used to write the password to Secret Manager, one secret per student, and
 * keep a `secret_name` pointer in a top-level `credentials/{uid}` document.
 * Both are gone. ENCRYPTION_CONTRACT.md §8 retires that path in favour of the
 * envelope the Google refresh token already uses, and docs/design/19 records
 * what changed the answer. The short version is that Secret Manager was chosen
 * when it was the only credential store in the system, and it stopped being
 * that: two stores meant two audit stories, two failure modes, and a password
 * whose blast radius was a project-level IAM role rather than a single KMS key
 * the connector deliberately cannot touch.
 *
 * The two halves go to different places, and that is the point:
 *
 *   password -> users/{uid}/credentials/school_password   sealed, contract §2
 *   username -> users/{uid}.school_username               a plain identifier
 *
 * There is no read path in this file and there cannot be one. This app holds
 * `cryptoKeyEncrypter` on `classistant-password-key` and nothing else, so
 * `getPortalPassword` -- which used to sit here and read the secret back -- is
 * not a function that was removed for tidiness. It is a function this process
 * has no permission to implement. Reading a school password is the agent's job,
 * and the agent is the only principal in the project with decrypt on that key
 * (contract §1). The connector cannot read it either, by the same mechanism.
 */

/**
 * Seals the password, then records the username.
 *
 * Order matters, and it is the same reasoning as before with the destinations
 * swapped: the credential goes down first, so a failure between the two leaves
 * a sealed password nobody is pointing at -- invisible, harmless, and rewritten
 * on the next attempt -- rather than a user document announcing a portal login
 * whose password was never stored, which the agent would discover at 3am with
 * nothing naming the cause.
 *
 * `storeCredential` encrypts before it writes (contract §6), so a KMS or crypto
 * failure gets this far and persists nothing at all.
 */
export async function savePortalCredentials(args: {
  userId: string;
  username: string;
  password: string;
}): Promise<void> {
  await storeCredential({
    uid: args.userId,
    type: "school_password",
    plaintext: args.password,
  });

  await recordSchoolUsername(args.userId, args.username);
}
