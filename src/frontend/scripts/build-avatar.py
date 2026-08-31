"""Turns public/logo.png into public/classy-avatar.png, the contact photo.

    python3 scripts/build-avatar.py

Run it if logo.png changes, then re-run `npm run build:vcard`.

## Why the logo cannot be embedded as-is

logo.png is the marketing lockup: two speech bubbles side by side, 2048x2048,
on a transparent background. Three things about that break a contact photo, and
this script fixes each one.

**Transparency.** A vCard photo has no page behind it. Contact apps composite it
on their own surface, so the transparent field renders black in dark mode and
white in light mode, and the drop shadow baked into the artwork is drawn for a
white page. Flattened onto white here so it looks the same everywhere.

**The circular crop.** Every contact app -- iOS, Android, WhatsApp -- masks the
photo to a circle. The lockup is wider than it is tall and sits nearly edge to
edge, so a naive square would have both bubbles' outer edges sliced off. The
content is scaled to fit the inscribed circle rather than the square: at the
vertical extremes of the artwork the circle is narrower than the canvas, and
SAFE_FRACTION below is derived from that, not guessed.

**Size.** 2048x2048 is 2.3MB, and base64 inflates by a third. A 3MB vCard is
refused outright by some clients and is slow to hand around over MMS. 512px is
past what any contact UI displays.

JPEG, not PNG, and the gap is not marginal: this artwork is all soft gradients
and a blurred drop shadow, which is the worst case for PNG's filters and the
best case for a DCT. The same 512px frame is 87KB as PNG and 15KB as JPEG at
q92, which is the difference between a 121KB vCard and a 21KB one. Nothing here
needs alpha any more, because the flatten above already removed it.
"""

from PIL import Image

SRC = "public/logo.png"
OUT = "public/classy-avatar.jpg"
SIZE = 512

# How much of the canvas width the artwork may span.
#
# Derived, not picked. For content of half-height h centred in a circle of
# radius r, the widest it can be at its own top and bottom edges is
# 2*sqrt(r^2 - h^2). The lockup is about 0.46 of its bounding box tall once the
# transparent margin is trimmed, so with r = 0.5 and h = 0.23:
#
#     2 * sqrt(0.25 - 0.0529) = 0.888
#
# 0.82 leaves visible breathing room inside that, because a mask that touches
# the artwork exactly still reads as clipped.
SAFE_FRACTION = 0.82

src = Image.open(SRC).convert("RGBA")

# Trim the transparent margin first. Scaling before this would be scaling the
# padding, and the padding is most of the file.
bbox = src.getbbox()
if bbox is None:
    raise SystemExit(f"{SRC} is fully transparent")
art = src.crop(bbox)
print(f"  source   {src.size[0]}x{src.size[1]}")
print(f"  trimmed  {art.size[0]}x{art.size[1]}  (bbox {bbox})")

# Fit inside the safe box, preserving aspect.
budget = int(SIZE * SAFE_FRACTION)
scale = min(budget / art.width, budget / art.height)
art = art.resize(
    (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
    Image.LANCZOS,
)

# Flatten onto white, centred. `paste` with the image as its own mask is what
# composites the alpha rather than punching a transparent hole in the canvas.
canvas = Image.new("RGB", (SIZE, SIZE), "#FFFFFF")
canvas.paste(art, ((SIZE - art.width) // 2, (SIZE - art.height) // 2), art)
# q92 rather than the usual 85. The card is small enough that the extra few KB
# is free, and this image is a logo: ringing around the hard edge of a speech
# bubble is far more visible than it would be on a photograph.
canvas.save(OUT, "JPEG", quality=92, optimize=True)

import os

print(f"  artwork  {art.size[0]}x{art.size[1]} inside {SIZE}x{SIZE} on white")
print(f"wrote {OUT}  ({os.path.getsize(OUT) / 1024:.1f} KB)")
