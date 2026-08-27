/**
 * The inner layer of the credential envelope: AES-256-GCM over one credential.
 *
 * Implements §4 of docs/ENCRYPTION_CONTRACT.md, which the connector's read path
 * is written against. Every constant here is part of that contract rather than
 * a local choice, so none of them may be "tidied": a change to the key length,
 * the IV length, or the byte order of the output is a silent decrypt failure on
 * the other side of the system, reported as an authentication tag mismatch with
 * nothing naming the cause.
 *
 * Deliberately NOT `server-only`, and deliberately free of Node built-ins.
 *
 * The two credentials this protects are produced in different places. A school
 * password is typed into the browser, so it can and should be sealed there and
 * only ever travel as ciphertext. A Google refresh token is the product of a
 * server-side code exchange and never exists in the browser at all -- shipping
 * one to the client in order to encrypt it "on device" would be strictly worse
 * than sealing it on the server. Both cases need identical bytes, so this file
 * uses Web Crypto, which is the one AES-GCM implementation present in both.
 *
 * Web Crypto also removes the single most likely way to get §4 wrong. Node's
 * `createCipheriv` hands back the ciphertext and the 16-byte authentication tag
 * as two separate values, and Python's `AESGCM.decrypt` -- what the connector
 * calls -- will only accept them concatenated. `crypto.subtle.encrypt` returns
 * them already joined in that order, so the mistake cannot be made here.
 */

/** AES-256. Contract §4. */
const DKEY_BYTES = 32;

/** 96-bit, the GCM standard length and what the connector assumes. Contract §4. */
export const IV_BYTES = 12;

/** GCM's authentication tag, in bits, as Web Crypto wants it. 16 bytes. */
const TAG_BITS = 128;

/** A fresh AES-256 data key. One per credential, never reused, never stored
 *  unwrapped -- `wrapDataKey` in lib/credentials.ts is what it goes on to. */
export function generateDataKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(DKEY_BYTES));
}

/**
 * A fresh IV. Contract §4: one per *write*, never reused with a key.
 *
 * Reusing an IV under the same key does not weaken GCM slightly, it breaks it:
 * two messages under one key/IV pair leak their XOR and can forge the
 * authentication tag. Since a fresh `dkey` is generated per credential anyway
 * this is belt and braces, and it stays that way.
 */
export function generateIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_BYTES));
}

/**
 * Seals one credential, returning `ciphertext || tag` exactly as §4 requires.
 *
 * No additional authenticated data on this layer -- the reference
 * implementation passes `None`, and the binding to a specific student is done
 * one layer out, as AAD on the KMS wrap of the data key.
 */
export async function sealWithDataKey(
  plaintext: string,
  dkey: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  if (dkey.length !== DKEY_BYTES) {
    throw new Error(`dkey must be ${DKEY_BYTES} bytes, got ${dkey.length}`);
  }
  if (iv.length !== IV_BYTES) {
    throw new Error(`iv must be ${IV_BYTES} bytes, got ${iv.length}`);
  }

  const key = await crypto.subtle.importKey("raw", toBuffer(dkey), "AES-GCM", false, [
    "encrypt",
  ]);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuffer(iv), tagLength: TAG_BITS },
    key,
    new TextEncoder().encode(plaintext),
  );
  return new Uint8Array(sealed);
}

/**
 * The inverse, for tests only.
 *
 * Nothing in this application decrypts a credential: the frontend holds
 * `cryptoKeyEncrypter` and not `cryptoKeyDecrypter`, and that asymmetry is the
 * whole security property (contract §1). This exists so the round trip can be
 * proven in a test, and it takes the data key as an argument -- there is no
 * path from here to a stored credential, because there is no path from here to
 * an unwrapped data key.
 */
export async function openWithDataKey(
  sealed: Uint8Array,
  dkey: Uint8Array,
  iv: Uint8Array,
): Promise<string> {
  const key = await crypto.subtle.importKey("raw", toBuffer(dkey), "AES-GCM", false, [
    "decrypt",
  ]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuffer(iv), tagLength: TAG_BITS },
    key,
    toBuffer(sealed),
  );
  return new TextDecoder().decode(plain);
}

/**
 * base64, without Node's Buffer so this stays usable in the browser.
 *
 * Chunked because `String.fromCharCode(...bytes)` spreads every byte into an
 * argument list and blows the call stack on large inputs. Credentials are
 * small, but this is the kind of limit that is discovered by a user rather than
 * by a test.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * A plain ArrayBuffer view of a byte array.
 *
 * `Uint8Array` may sit at an offset inside a larger buffer, and handing its
 * `.buffer` to Web Crypto would silently encrypt the whole underlying region.
 * Slicing is the cheap way to be certain the bytes passed are the bytes meant.
 */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
