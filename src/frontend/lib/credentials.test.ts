import assert from "node:assert/strict";
import { test } from "node:test";

import { KEY_FOR } from "./credentials";

/**
 * Which key wraps which credential.
 *
 * One assertion, and it is here because this is the only decision in the
 * envelope that fails silently in both directions. Wrapping a school password
 * under `classistant-key` succeeds, writes a document that passes every other
 * check in this suite, and is wrong in exactly one way: the connector can now
 * read it. Nothing in the write path, the read path, or Firestore would ever
 * say so. The reverse -- a refresh token under the password key -- at least
 * announces itself, as a connector that cannot decrypt anything.
 *
 * ENCRYPTION_CONTRACT.md §1 and §5. The separation is enforced by the IAM
 * grants on the two keys; this test is what stops the code from routing around
 * them by accident.
 *
 * Needs `--conditions=react-server`, which the `test` script passes: this
 * module imports `server-only`, and that package resolves to a throw under any
 * other condition.
 */

test("each credential type is wrapped by its own KMS key", () => {
  assert.equal(KEY_FOR.school_password, "classistant-password-key");
  assert.equal(KEY_FOR.google_refresh_token, "classistant-key");

  // Not just distinct values -- distinct from each other. A find-and-replace
  // that pointed both at one key would satisfy neither line above, but a future
  // third credential type sharing a key would slip past them.
  const keys = Object.values(KEY_FOR);
  assert.equal(new Set(keys).size, keys.length, "two credential types share a KMS key");
});
