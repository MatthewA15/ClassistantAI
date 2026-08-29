"""Markdown -> Google Docs `batchUpdate` requests. Pure: no Google client, no I/O.

The Docs API has no markdown import; formatting is applied by sending style
requests against character ranges. The obvious implementation interleaves
`insertText` with style requests and advances a cursor, but every insert shifts
the indices of everything after it, and that bookkeeping is where this kind of
code goes wrong.

So this module does it the other way round:

  1. Walk the parsed markdown once, building (a) the complete plain text of the
     finished document and (b) styling instructions as offsets into that text.
  2. Emit a single `insertText` at `insert_index` carrying the whole string.
  3. Emit every style request after it, each offset shifted by `insert_index`.

Because exactly one request inserts text, no index is ever invalidated, and the
converter reduces to arithmetic over a string we already hold.

INDEX UNITS -- READ THIS BEFORE CHANGING ANY OFFSET MATH
--------------------------------------------------------
The Docs API counts UTF-16 code units, not Python characters. A character
outside the Basic Multilingual Plane -- an emoji, some CJK extensions -- is one
Python character but occupies TWO Docs indices. Agent-written study plans
contain emoji often enough that this is not theoretical.

Every offset here is therefore measured with `utf16_len()`, never `len()`.
`len()` looks correct and is wrong the moment a plan says "Week 1 goals" with a
mortarboard next to it: each such character before a styled run drags that run's
start one index earlier, so the bold lands on the wrong characters and every
later request is off by a growing amount.

DOCUMENT GEOMETRY
-----------------
A Docs body starts at index 1, not 0, and its final newline cannot be deleted.
Blocks here are joined with "\n" and the last block is left unterminated, so the
body's own final newline terminates it and no trailing empty paragraph appears.
"""
from __future__ import annotations

from typing import Iterable

import mistune

# Docs named styles for markdown heading levels. Levels 4-6 are deliberately
# absent: they are out of scope for this change and fall through to unstyled
# body text rather than being dropped.
# TODO(matthew): extending to HEADING_4..6 is a one-line change to this dict;
# the index model does not care about heading depth.
_HEADING_STYLES = {1: "HEADING_1", 2: "HEADING_2", 3: "HEADING_3"}

# Setting `link.url` alone makes text clickable but leaves it looking like
# body text, which in a study plan reads as "the links are broken". The Docs
# UI pairs a link with blue + underline when you insert one by hand, so we do
# the same explicitly -- the API applies no styling of its own.
# #1155cc, Docs' default link blue. Colour components are 0..1 floats.
_LINK_COLOR = {
    "color": {"rgbColor": {"red": 17 / 255, "green": 85 / 255, "blue": 204 / 255}}
}

_BULLET_PRESET_UNORDERED = "BULLET_DISC_CIRCLE_SQUARE"
_BULLET_PRESET_ORDERED = "NUMBERED_DECIMAL_ALPHA_ROMAN"

# renderer=None puts mistune v3 in AST mode: calling the parser returns the
# token list instead of rendered HTML. Tables, strikethrough and friends are
# plugins and stay off, so those constructs arrive as ordinary paragraph text --
# which is exactly the "pass it through unstyled" behaviour this converter wants.
_PARSER = mistune.create_markdown(renderer=None)


def utf16_len(text: str) -> int:
    """Length of `text` in UTF-16 code units -- the unit Docs indices use.

    Not `len()`. See the module docstring.
    """
    return len(text.encode("utf-16-le")) // 2


class MarkdownConversionError(Exception):
    """Raised when markdown cannot be converted to Docs requests.

    Deliberately carries no document text: the router logs this exception, and
    document content must never reach a log line.
    """


class _Builder:
    """Accumulates the plain text and the offsets of everything to be styled.

    Offsets recorded here are relative to the plain text (0-based). They are
    shifted to document indices exactly once, in `build()`.

    The separator between blocks is *pending* rather than written eagerly, so a
    block that turns out to emit no text (a blank line, an empty paragraph)
    costs nothing and cannot leave a stray empty paragraph behind.
    """

    def __init__(self) -> None:
        self._parts: list[str] = []
        self._cursor = 0  # UTF-16 code units written so far
        self._pending_sep = False
        self._para_styles: list[tuple[int, int, str]] = []  # start, end, named style
        self._text_styles: list[tuple[int, int, dict]] = []  # start, end, textStyle
        self._bullets: list[tuple[int, int, str]] = []  # start, end, preset

    # -- text accumulation -------------------------------------------------

    def _write(self, text: str) -> None:
        if not text:
            return
        if self._pending_sep:
            self._pending_sep = False
            self._parts.append("\n")
            self._cursor += 1  # "\n" is one UTF-16 code unit
        self._parts.append(text)
        self._cursor += utf16_len(text)

    def _start_block(self) -> None:
        if self._parts:
            self._pending_sep = True

    def _next_pos(self) -> int:
        """Offset the next written character will land at, separator included."""
        return self._cursor + (1 if self._pending_sep else 0)

    @property
    def plain_text(self) -> str:
        return "".join(self._parts)

    # -- block level -------------------------------------------------------

    def walk_blocks(self, nodes: Iterable[dict]) -> None:
        for node in nodes:
            self._block(node)

    def _block(self, node: dict) -> tuple[int, int] | None:
        """Emit one block. Returns the (start, end) offsets it wrote, or None."""
        ntype = node.get("type")

        if ntype in ("blank_line", "thematic_break"):
            # Nothing to lose: a thematic break carries no text, only a visual
            # divider.
            # TODO(matthew): a horizontal rule could become a bottom paragraph
            # border; out of scope here.
            return None

        if ntype == "heading":
            span = self._simple_block(node.get("children") or [])
            if span is None:
                return None
            style = _HEADING_STYLES.get((node.get("attrs") or {}).get("level"))
            if style:
                self._para_styles.append((span[0], span[1], style))
            return span

        if ntype in ("paragraph", "block_text"):
            return self._simple_block(node.get("children") or [])

        if ntype == "list":
            self._list(node)
            return None  # a list spans several paragraphs; runs are tracked in _list

        if ntype == "block_quote":
            # Out of scope as a style; recurse so the text survives unstyled.
            # TODO(matthew): block quotes could become an indented paragraph
            # style; the extension point is here.
            self.walk_blocks(node.get("children") or [])
            return None

        if ntype in ("block_code", "block_html"):
            # Out of scope. Emit the source verbatim as plain paragraphs -- a
            # student seeing an unstyled code block is far better than a student
            # missing one.
            return self._raw_block(node)

        # Unknown or future block type: recurse if it has children, otherwise
        # emit whatever raw text it carries. Never drop it silently.
        if node.get("children"):
            self.walk_blocks(node["children"])
            return None
        if node.get("raw"):
            return self._raw_block(node)
        return None

    def _simple_block(self, children: Iterable[dict]) -> tuple[int, int] | None:
        self._start_block()
        start = self._next_pos()
        self.walk_inline(children)
        return (start, self._cursor) if self._cursor > start else None

    def _raw_block(self, node: dict) -> tuple[int, int] | None:
        self._start_block()
        start = self._next_pos()
        self._write((node.get("raw") or "").rstrip("\n"))
        return (start, self._cursor) if self._cursor > start else None

    def _list(self, node: dict) -> None:
        """Emit a list's direct items and bullet them in contiguous runs.

        Nested lists are out of scope, so items are flattened to one level and
        NO leading tabs are emitted -- see `build()` for why tabs specifically
        would break the index model. A nested list is still walked as its own
        list node so it keeps its own ordered/unordered glyph; because its items
        sit between the parent's items, the parent's run is split around them
        and the two ranges never overlap.
        """
        ordered = bool((node.get("attrs") or {}).get("ordered"))
        preset = _BULLET_PRESET_ORDERED if ordered else _BULLET_PRESET_UNORDERED

        runs: list[list[int]] = []  # [start, end], merged while contiguous
        for item in node.get("children") or []:
            if item.get("type") != "list_item":
                self._block(item)
                continue

            # One item can hold several blocks, and a nested list may sit
            # between them. Each contiguous group of the item's own blocks is
            # tracked separately so a nested list never ends up inside the
            # parent's range -- otherwise the parent's preset, applied later,
            # would overwrite the glyph the nested list just asked for.
            groups: list[list[int]] = []
            current: list[int] | None = None
            for child in item.get("children") or []:
                if child.get("type") == "list":
                    if current is not None:
                        groups.append(current)
                        current = None
                    self._list(child)  # nested: its own runs, its own preset
                    continue
                span = self._block(child)
                if span is None:
                    continue
                if current is None:
                    current = [span[0], span[1]]
                else:
                    current[1] = span[1]
            if current is not None:
                groups.append(current)

            for start, end in groups:
                if end <= start:
                    continue
                # A run continues only when this group begins immediately after
                # the previous one, separated by the single "\n" between blocks.
                if runs and runs[-1][1] + 1 == start:
                    runs[-1][1] = end
                else:
                    runs.append([start, end])

        for start, end in runs:
            self._bullets.append((start, end, preset))

    # -- inline level ------------------------------------------------------

    def walk_inline(self, nodes: Iterable[dict]) -> None:
        for node in nodes:
            self._inline(node)

    def _inline(self, node: dict) -> None:
        ntype = node.get("type")

        if ntype == "text":
            self._write(node.get("raw") or "")
            return

        if ntype in ("softbreak", "linebreak"):
            # A real newline rather than CommonMark's space, so line-oriented
            # passthrough content (a markdown table) keeps its shape instead of
            # collapsing onto one line.
            self._write("\n")
            return

        if ntype == "strong":
            self._styled_run(node, {"bold": True})
            return

        if ntype == "emphasis":
            self._styled_run(node, {"italic": True})
            return

        if ntype == "link":
            url = (node.get("attrs") or {}).get("url")
            self._styled_run(
                node,
                {
                    "link": {"url": url},
                    "foregroundColor": _LINK_COLOR,
                    "underline": True,
                }
                if url
                else None,
            )
            return

        if ntype == "image":
            # Out of scope. Keep the alt text -- or the URL when there is none
            # -- so the reference is not lost.
            # TODO(matthew): real images need insertInlineImage, which inserts
            # content and so must be sequenced against the index model.
            start = self._cursor
            self.walk_inline(node.get("children") or [])
            if self._cursor == start:
                self._write((node.get("attrs") or {}).get("url") or "")
            return

        if ntype in ("codespan", "inline_html"):
            # TODO(matthew): codespan could map to a monospace text style.
            self._write(node.get("raw") or "")
            return

        if node.get("children"):
            self.walk_inline(node["children"])
        elif node.get("raw"):
            self._write(node["raw"])

    def _styled_run(self, node: dict, style: dict | None) -> None:
        start = self._cursor
        self.walk_inline(node.get("children") or [])
        if style and self._cursor > start:
            self._text_styles.append((start, self._cursor, style))

    # -- emission ----------------------------------------------------------

    def build(self, insert_index: int) -> list[dict]:
        text = self.plain_text
        if not text:
            return []

        def rng(start: int, end: int) -> dict:
            return {"startIndex": start + insert_index, "endIndex": end + insert_index}

        requests: list[dict] = [
            {"insertText": {"location": {"index": insert_index}, "text": text}}
        ]

        for start, end, style in self._para_styles:
            requests.append({
                "updateParagraphStyle": {
                    "range": rng(start, end),
                    "paragraphStyle": {"namedStyleType": style},
                    "fields": "namedStyleType",
                }
            })

        for start, end, style in self._text_styles:
            requests.append({
                "updateTextStyle": {
                    "range": rng(start, end),
                    "textStyle": style,
                    # The mask must name every property being set, or Docs
                    # silently ignores the ones it does not hear about.
                    "fields": ",".join(style),
                }
            })

        # Bullets go last on purpose. `createParagraphBullets` is documented to
        # read leading tabs as a nesting level and to REMOVE them, which would
        # shift every index after it. We emit no tabs, so nothing shifts -- but
        # ordering these last means no request that depends on the original
        # indices can ever run after one that could move them.
        for start, end, preset in self._bullets:
            requests.append({
                "createParagraphBullets": {"range": rng(start, end), "bulletPreset": preset}
            })

        return requests


def markdown_to_requests(markdown_text: str, *, insert_index: int = 1) -> list[dict]:
    """Convert `markdown_text` into an ordered list of Docs `batchUpdate` requests.

    Returns `[]` for input with no text content. The first request is always the
    single `insertText`; callers and tests can read the exact plain text that
    will land in the document from `requests[0]["insertText"]["text"]`.

    Raises `MarkdownConversionError` if the markdown cannot be converted; the
    caller is expected to fall back to a plain `insertText`.
    """
    try:
        tokens = _PARSER(markdown_text or "")
        if isinstance(tokens, tuple):  # defensive: some builds return (tokens, state)
            tokens = tokens[0]
        builder = _Builder()
        builder.walk_blocks(tokens)
        return builder.build(insert_index)
    except Exception as exc:  # noqa: BLE001 -- deliberately broad, see docstring
        # No document text in this message: it reaches a log line.
        raise MarkdownConversionError(
            f"markdown conversion failed in {type(exc).__name__}"
        ) from exc
