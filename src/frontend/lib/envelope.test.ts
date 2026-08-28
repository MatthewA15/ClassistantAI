import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
  IV_BYTES,
  fromBase64,
  generateDataKey,
  generateIv,
  openWithDataKey,
  sealWithDataKey,
  toBase64,
} from "./envelope";

/**
 * Byte-compatibility with the connector, which is written in Python.
 *
 * These are not tests of AES -- Web Crypto and `cryptography` are both fine
 * implementations and neither needs verifying here. They test the parts of
 * docs/ENCRYPTION_CONTRACT.md that are *conventions* rather than algorithms,
 * and that therefore have no way of announcing themselves when they disagree:
 * whether the authentication tag is appended, how the IV is encoded, and what
 * form the data key takes on its way to KMS.
 *
 * Each of those failures surfaces at the far end as "authentication failed",
 * hours later, on a machine nobody is watching. Cross-checking against the
 * actual Python library is the only way to find them at this end instead.
 *
 * The Python tests skip themselves if `cryptography` is absent, so a machine
 * without it still gets the rest of the suite rather than a red build.
 */

function python(script: string, input: string): string {
  return execFileSync("python3", ["-c", script], {
    input,
    encoding: "utf8",
  }).trim();
}

function hasPython(): boolean {
  try {
    python("import cryptography", "");
    return true;
  } catch {
    return false;
  }
}

const pythonAvailable = hasPython();
const skipPython = pythonAvailable
  ? false
  : "python3 with `cryptography` not available";

test("round trips through its own implementation", async () => {
  const dkey = generateDataKey();
  const iv = generateIv();
  const message = "café 日本語 — unicode survives the trip";

  const sealed = await sealWithDataKey(message, dkey, iv);
  assert.equal(await openWithDataKey(sealed, dkey, iv), message);
});

test("appends the 16-byte GCM tag to the ciphertext", async () => {
  const message = "0123456789";
  const sealed = await sealWithDataKey(message, generateDataKey(), generateIv());

  // Contract §4: the stored value is ciphertext || tag. GCM is a stream mode,
  // so the ciphertext is exactly the plaintext length and the whole of the
  // remainder is the tag. If this is 0, the tag was dropped.
  assert.equal(sealed.length - message.length, 16);
});

test("uses a 96-bit IV and a 256-bit key", () => {
  assert.equal(generateIv().length, 12);
  assert.equal(IV_BYTES, 12);
  assert.equal(generateDataKey().length, 32);
});

test("never produces the same IV or key twice", () => {
  const ivs = new Set(Array.from({ length: 200 }, () => toBase64(generateIv())));
  const keys = new Set(
    Array.from({ length: 200 }, () => toBase64(generateDataKey())),
  );
  assert.equal(ivs.size, 200, "IV repeated — GCM is broken by IV reuse");
  assert.equal(keys.size, 200);
});

test("rejects a wrong-sized key or IV rather than producing bad bytes", async () => {
  await assert.rejects(
    () => sealWithDataKey("x", new Uint8Array(16), generateIv()),
    /dkey must be 32 bytes/,
  );
  await assert.rejects(
    () => sealWithDataKey("x", generateDataKey(), new Uint8Array(16)),
    /iv must be 12 bytes/,
  );
});

test("fails closed when the ciphertext is tampered with", async () => {
  const dkey = generateDataKey();
  const iv = generateIv();
  const sealed = await sealWithDataKey("do not modify", dkey, iv);
  sealed[0] ^= 0xff;

  await assert.rejects(() => openWithDataKey(sealed, dkey, iv));
});

test("base64 helpers round trip arbitrary bytes", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(1024));
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test(
  "Python's AESGCM decrypts what we seal — the connector's read path",
  { skip: skipPython },
  async () => {
    const dkey = generateDataKey();
    const iv = generateIv();
    const message = "super-secret-refresh-token-value";
    const sealed = await sealWithDataKey(message, dkey, iv);

    // Exactly the call in the connector and in scripts/seed_credential.py:
    // AESGCM over ciphertext||tag, with no AAD on this layer.
    const decrypted = python(
      `
import sys, json, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
d = json.load(sys.stdin)
print(AESGCM(base64.b64decode(d["dkey"])).decrypt(
    base64.b64decode(d["iv"]), base64.b64decode(d["ct"]), None).decode())
`,
      JSON.stringify({
        dkey: toBase64(dkey),
        iv: toBase64(iv),
        ct: toBase64(sealed),
      }),
    );

    assert.equal(decrypted, message);
  },
);

test(
  "we decrypt what Python's AESGCM seals",
  { skip: skipPython },
  async () => {
    const message = "password-from-python";
    const payload = JSON.parse(
      python(
        `
import os, base64, json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
dkey, iv = os.urandom(32), os.urandom(12)
ct = AESGCM(dkey).encrypt(iv, ${JSON.stringify(message)}.encode("utf-8"), None)
print(json.dumps({"dkey": base64.b64encode(dkey).decode(),
                  "iv": base64.b64encode(iv).decode(),
                  "ct": base64.b64encode(ct).decode()}))
`,
        "",
      ),
    ) as { dkey: string; iv: string; ct: string };

    assert.equal(
      await openWithDataKey(
        fromBase64(payload.ct),
        fromBase64(payload.dkey),
        fromBase64(payload.iv),
      ),
      message,
    );
  },
);

test(
  "the KMS plaintext is the base64 TEXT of the key, matching Python",
  { skip: skipPython },
  () => {
    // Contract §5, and the failure mode that makes it worth a test: sending the
    // 32 raw bytes instead unwraps on the connector to 24 bytes after its
    // base64 decode, and surfaces as an AES key-length error pointing at the
    // wrong layer entirely.
    const dkey = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
    const ours = Buffer.from(toBase64(dkey), "utf8");

    const theirs = python(
      `
import sys, base64
dkey = bytes((i*7+3)&0xff for i in range(32))
sys.stdout.write(base64.b64encode(base64.b64encode(dkey)).decode())
`,
      "",
    );

    assert.equal(ours.toString("base64"), theirs);
    assert.equal(ours.length, 44, "base64 of 32 bytes is 44 characters");
  },
);
