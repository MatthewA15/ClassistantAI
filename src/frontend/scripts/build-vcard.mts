/**
 * Generates public/classy.vcf.
 *
 *   npm run build:vcard
 *
 * Run it after changing the number, the copy, or public/classy-avatar.jpg, and
 * commit the result. The .vcf is a build product but it is committed, because
 * it is served as a static asset and nothing about a deploy should depend on a
 * rasteriser being installed.
 *
 * ## Why this file exists at all
 *
 * The first classy.vcf was written by hand from the template in issue #38, and
 * three things about it were wrong in ways that are invisible when you look at
 * the text (@obaodelana: "the phone number and profile picture doesn't show"):
 *
 * 1. **No TEL property.** The template never had one, so there was no number to
 *    show. This is the whole of the first half of the bug.
 *
 * 2. **`PHOTO;VALUE=URL:` pointing at classistant.ca/logo.png.** The URL is live
 *    and returns 200, so the file looked correct. Contact clients simply do not
 *    fetch it: iOS Contacts, Android, and WhatsApp all ignore remote photo
 *    references in an imported vCard, because importing a contact would
 *    otherwise make a network request to a third party. The photo has to be
 *    embedded.
 *
 * 3. **LF line endings.** RFC 2426 requires CRLF, and `file(1)` flags the old
 *    one outright: "lines not separated by CRLF". Lenient parsers cope, strict
 *    ones drop properties from the point they get confused, which is a very good
 *    way to lose whichever property happens to sit last.
 *
 * ## The photo is logo.png, prepared
 *
 * It embeds public/classy-avatar.jpg, which scripts/build-avatar.py derives from
 * public/logo.png. The lockup is the photo we want; it just cannot be embedded
 * raw. It is 2048x2048 on a transparent background and wider than it is tall, so
 * as a contact photo it would render on black in dark mode and lose both
 * bubbles' outer edges to the circular crop every contact app applies. The
 * avatar script trims, insets to fit the inscribed circle, flattens onto white,
 * downsizes to 512, and re-encodes as JPEG. That script's header has the
 * arithmetic and the size comparison.
 *
 * Regenerating logo.png means re-running both, in that order.
 */
import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * The number students text, in E.164.
 *
 * A literal, deliberately, rather than read from `TWILIO_FROM_NUMBER`. This
 * script writes a file that is committed and served publicly, so the value has
 * to be reviewable in the diff; taking it from the environment would mean the
 * committed artefact depended on whose shell ran the script, and two people
 * regenerating it would produce two different cards with no sign of why.
 *
 * It is not a secret. It is the number printed on the card we hand to students,
 * and it must match `TWILIO_FROM_NUMBER` in the deployed functions -- if that
 * number is ever changed, change it here and re-run.
 */
const TEL = "+13654007007";

const AVATAR = "public/classy-avatar.jpg";
const OUT = "public/classy.vcf";

/**
 * Folds a property line to 75 octets, continuation lines prefixed with one
 * space, per RFC 2426 section 2.6.
 *
 * Not cosmetic. An unfolded base64 photo is a single line tens of thousands of
 * characters long, and parsers that enforce the limit truncate it -- which
 * produces a vCard that imports cleanly with a corrupt image, the least
 * debuggable of the available failures.
 *
 * Counted in octets rather than characters because the limit is bytes. Nothing
 * here is non-ASCII today, but the NOTE is copy and copy acquires an accent
 * eventually.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    const chunk = bytes.subarray(start, start + limit);
    out.push((start === 0 ? "" : " ") + chunk.toString("utf8"));
    start += limit;
    limit = 74; // continuation lines spend one octet on the leading space
  }
  return out.join("\r\n");
}

const photo = readFileSync(AVATAR).toString("base64");

const properties = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "FN:Classy",
  "N:Classy;;;;",
  // ORG so the card reads as the product rather than as a person called Classy
  // with no context, which is what a bare FN looks like in a contact list.
  "ORG:Classistant",
  `TEL;TYPE=CELL,VOICE:${TEL}`,
  "URL:https://classistant.ca",
  "NOTE:A school assistant that lives in your text messages.",
  `PHOTO;ENCODING=b;TYPE=JPEG:${photo}`,
  "END:VCARD",
];

// CRLF between properties, and a trailing CRLF after END:VCARD. Both are what
// the spec asks for, and the old file had neither.
writeFileSync(OUT, properties.map(fold).join("\r\n") + "\r\n");

const bytes = readFileSync(OUT).length;
console.log(`wrote ${OUT}`);
console.log(`  photo   ${AVATAR} -> ${photo.length} base64 chars`);
console.log(`  tel     ${TEL}`);
console.log(`  size    ${(bytes / 1024).toFixed(1)} KB`);
