"""Tests for the markdown -> Docs request converter.

The converter is a pure function, so everything here is exercised directly:
no Google client, no credentials, no mocking. Golden tests compare whole
request lists; the offset tests slice the emitted plain text back out using
UTF-16 arithmetic, which is the only way to prove an index is actually right.

Emoji are written as escapes (\\U0001F393) rather than literals so this file
stays pure ASCII and cannot be broken by an editor or terminal re-encoding it.
"""
import pytest

from app.services.markdown_to_requests import (
    MarkdownConversionError,
    markdown_to_requests,
    utf16_len,
)

GRADUATION_CAP = "\U0001F393"  # non-BMP: 1 Python char, 2 UTF-16 code units
INSERT_INDEX = 1  # a Docs body starts at index 1


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def plain_text_of(requests):
    """The exact string the single insertText will put into the document."""
    return requests[0]["insertText"]["text"]


def slice_at(text, start, end, insert_index=INSERT_INDEX):
    """Return the substring a Docs range [start, end) refers to.

    Slices in UTF-16 code units -- the unit the API counts in -- so this
    independently reproduces the arithmetic the converter claims to do rather
    than trusting Python's character indexing.
    """
    raw = text.encode("utf-16-le")
    return raw[(start - insert_index) * 2:(end - insert_index) * 2].decode("utf-16-le")


def requests_of_kind(requests, kind):
    return [r[kind] for r in requests if kind in r]


def insert_text_request(text, index=INSERT_INDEX):
    return {"insertText": {"location": {"index": index}, "text": text}}


# --------------------------------------------------------------------------
# golden tests -- one supported construct at a time, whole-list equality
# --------------------------------------------------------------------------

def test_heading_levels_one_to_three_are_named_styles():
    assert markdown_to_requests("# Title") == [
        insert_text_request("Title"),
        {
            "updateParagraphStyle": {
                "range": {"startIndex": 1, "endIndex": 6},
                "paragraphStyle": {"namedStyleType": "HEADING_1"},
                "fields": "namedStyleType",
            }
        },
    ]

    for level, style in ((2, "HEADING_2"), (3, "HEADING_3")):
        requests = markdown_to_requests(f"{'#' * level} Title")
        assert requests_of_kind(requests, "updateParagraphStyle") == [
            {
                "range": {"startIndex": 1, "endIndex": 6},
                "paragraphStyle": {"namedStyleType": style},
                "fields": "namedStyleType",
            }
        ]


def test_bold_is_an_update_text_style():
    assert markdown_to_requests("**bold**") == [
        insert_text_request("bold"),
        {
            "updateTextStyle": {
                "range": {"startIndex": 1, "endIndex": 5},
                "textStyle": {"bold": True},
                "fields": "bold",
            }
        },
    ]


def test_italic_is_an_update_text_style():
    assert markdown_to_requests("*slanted*") == [
        insert_text_request("slanted"),
        {
            "updateTextStyle": {
                "range": {"startIndex": 1, "endIndex": 8},
                "textStyle": {"italic": True},
                "fields": "italic",
            }
        },
    ]


def test_link_carries_the_url_and_only_covers_the_label():
    assert markdown_to_requests("[syllabus](https://example.com/s)") == [
        insert_text_request("syllabus"),
        {
            "updateTextStyle": {
                "range": {"startIndex": 1, "endIndex": 9},
                "textStyle": {"link": {"url": "https://example.com/s"}},
                "fields": "link",
            }
        },
    ]


def test_unordered_list_is_one_bullet_range_over_both_paragraphs():
    assert markdown_to_requests("- alpha\n- beta") == [
        insert_text_request("alpha\nbeta"),
        {
            "createParagraphBullets": {
                "range": {"startIndex": 1, "endIndex": 11},
                "bulletPreset": "BULLET_DISC_CIRCLE_SQUARE",
            }
        },
    ]


def test_ordered_list_uses_the_numbered_preset():
    assert markdown_to_requests("1. alpha\n2. beta") == [
        insert_text_request("alpha\nbeta"),
        {
            "createParagraphBullets": {
                "range": {"startIndex": 1, "endIndex": 11},
                "bulletPreset": "NUMBERED_DECIMAL_ALPHA_ROMAN",
            }
        },
    ]


def test_paragraphs_are_separated_by_a_single_newline_and_need_no_requests():
    # Blank-line separation in markdown becomes one Docs paragraph break, not a
    # blank paragraph, and the last block is left unterminated so the body's own
    # final newline terminates it.
    requests = markdown_to_requests("one\n\ntwo")
    assert requests == [insert_text_request("one\ntwo")]


def test_empty_and_whitespace_only_input_produces_no_requests():
    assert markdown_to_requests("") == []
    assert markdown_to_requests("   \n\n  ") == []


# --------------------------------------------------------------------------
# the combined document -- offsets must be right relative to the plain text
# --------------------------------------------------------------------------

COMBINED_MARKDOWN = """# Study Plan

Read **chapter 3** and *review* the [syllabus](https://example.com/s).

- Monday
- Tuesday

1. First
2. Second

## Next week
"""


def test_combined_document_offsets_resolve_to_the_right_substrings():
    requests = markdown_to_requests(COMBINED_MARKDOWN)
    text = plain_text_of(requests)

    assert text == (
        "Study Plan\n"
        "Read chapter 3 and review the syllabus.\n"
        "Monday\nTuesday\n"
        "First\nSecond\n"
        "Next week"
    )

    # Every range, whatever kind, must slice back to the text it claims.
    resolved = []
    for request in requests[1:]:
        (kind, body), = request.items()
        rng = body["range"]
        resolved.append((kind, slice_at(text, rng["startIndex"], rng["endIndex"])))

    assert resolved == [
        ("updateParagraphStyle", "Study Plan"),
        ("updateParagraphStyle", "Next week"),
        ("updateTextStyle", "chapter 3"),
        ("updateTextStyle", "review"),
        ("updateTextStyle", "syllabus"),
        ("createParagraphBullets", "Monday\nTuesday"),
        ("createParagraphBullets", "First\nSecond"),
    ]


def test_combined_document_applies_the_expected_style_kinds():
    requests = markdown_to_requests(COMBINED_MARKDOWN)

    assert [r["paragraphStyle"]["namedStyleType"]
            for r in requests_of_kind(requests, "updateParagraphStyle")] == [
        "HEADING_1",
        "HEADING_2",
    ]
    assert [r["textStyle"] for r in requests_of_kind(requests, "updateTextStyle")] == [
        {"bold": True},
        {"italic": True},
        {"link": {"url": "https://example.com/s"}},
    ]
    assert [r["bulletPreset"]
            for r in requests_of_kind(requests, "createParagraphBullets")] == [
        "BULLET_DISC_CIRCLE_SQUARE",
        "NUMBERED_DECIMAL_ALPHA_ROMAN",
    ]


def test_exactly_one_request_inserts_text():
    # The whole index model rests on this: if anything else inserted text, every
    # offset after it would be wrong.
    requests = markdown_to_requests(COMBINED_MARKDOWN)
    assert len(requests_of_kind(requests, "insertText")) == 1
    assert "insertText" in requests[0]


def test_bullets_are_emitted_after_every_other_request():
    # createParagraphBullets is the one request that can move indices (it strips
    # leading tabs). Nothing that depends on the original offsets may follow it.
    requests = markdown_to_requests(COMBINED_MARKDOWN)
    kinds = [next(iter(r)) for r in requests]
    first_bullet = kinds.index("createParagraphBullets")
    assert set(kinds[first_bullet:]) == {"createParagraphBullets"}


def test_no_request_emits_a_leading_tab():
    # Nesting is out of scope precisely so that no tab is ever emitted; see the
    # createParagraphBullets note in the module docstring.
    text = plain_text_of(markdown_to_requests("- a\n  - b\n    - c\n- d"))
    assert "\t" not in text
    assert not any(line.startswith((" ", "\t")) for line in text.split("\n"))


# --------------------------------------------------------------------------
# UTF-16 -- the test this whole design exists to pass
# --------------------------------------------------------------------------

def test_utf16_len_counts_code_units_not_characters():
    assert utf16_len("abc") == 3
    assert utf16_len(GRADUATION_CAP) == 2
    assert len(GRADUATION_CAP) == 1  # the trap: Python disagrees with Docs


def test_bold_run_after_an_emoji_starts_at_the_right_index():
    requests = markdown_to_requests(f"Week {GRADUATION_CAP} **goals**")
    text = plain_text_of(requests)
    assert text == f"Week {GRADUATION_CAP} goals"

    (style,) = requests_of_kind(requests, "updateTextStyle")
    start, end = style["range"]["startIndex"], style["range"]["endIndex"]

    # "Week " is 5 units, the cap is 2, the space is 1 -> the run starts at
    # 8 + insert_index. Using len() would have produced 7 + insert_index and
    # silently bolded ' goal'.
    assert (start, end) == (9, 14)
    assert slice_at(text, start, end) == "goals"


def test_every_emoji_before_a_run_shifts_it_by_two_not_one():
    caps = GRADUATION_CAP * 3
    requests = markdown_to_requests(f"{caps}**x**")
    (style,) = requests_of_kind(requests, "updateTextStyle")
    start = style["range"]["startIndex"]

    assert start == INSERT_INDEX + 6  # 3 caps * 2 code units, not 3 * 1
    assert slice_at(plain_text_of(requests), start, start + 1) == "x"


def test_offsets_stay_correct_with_emoji_across_several_blocks():
    markdown = (
        f"# {GRADUATION_CAP} Plan\n\n"
        f"{GRADUATION_CAP} intro **bold** text\n\n"
        f"- {GRADUATION_CAP} item one\n- item two\n"
    )
    requests = markdown_to_requests(markdown)
    text = plain_text_of(requests)

    for request in requests[1:]:
        (_, body), = request.items()
        rng = body["range"]
        # A range that ran off the end, or landed mid-surrogate-pair, would
        # raise or mis-decode here rather than silently passing.
        assert slice_at(text, rng["startIndex"], rng["endIndex"])

    (style,) = requests_of_kind(requests, "updateTextStyle")
    assert slice_at(text, style["range"]["startIndex"], style["range"]["endIndex"]) == "bold"


def test_final_index_never_exceeds_the_documents_length():
    requests = markdown_to_requests(f"# {GRADUATION_CAP}\n\ntail {GRADUATION_CAP}")
    text = plain_text_of(requests)
    limit = utf16_len(text) + INSERT_INDEX
    for request in requests[1:]:
        (_, body), = request.items()
        assert body["range"]["endIndex"] <= limit


# --------------------------------------------------------------------------
# unsupported constructs -- unstyled, but never dropped
# --------------------------------------------------------------------------

def test_table_passes_through_as_plain_text_with_no_style_requests():
    markdown = "| week | topic |\n|---|---|\n| 1 | intro |"
    requests = markdown_to_requests(markdown)

    assert len(requests) == 1  # insertText only
    text = plain_text_of(requests)
    for line in markdown.split("\n"):
        assert line in text, f"table row lost: {line!r}"


def test_code_fence_keeps_its_code_and_emits_no_style_requests():
    requests = markdown_to_requests("```python\nx = 1\ny = 2\n```")

    assert len(requests) == 1
    text = plain_text_of(requests)
    assert "x = 1" in text and "y = 2" in text


def test_block_quote_keeps_its_text():
    requests = markdown_to_requests("> remember the deadline")
    assert plain_text_of(requests) == "remember the deadline"


def test_headings_four_to_six_keep_their_text_unstyled():
    # Out of scope by design: styled as body text rather than dropped.
    for level in (4, 5, 6):
        requests = markdown_to_requests(f"{'#' * level} Deep")
        assert plain_text_of(requests) == "Deep"
        assert requests_of_kind(requests, "updateParagraphStyle") == []


def test_image_keeps_its_alt_text_and_falls_back_to_the_url():
    assert plain_text_of(markdown_to_requests("![course logo](http://x/i.png)")) == (
        "course logo"
    )
    assert plain_text_of(markdown_to_requests("![](http://x/i.png)")) == "http://x/i.png"


def test_inline_code_keeps_its_text():
    text = plain_text_of(markdown_to_requests("run `pytest -q` first"))
    assert text == "run pytest -q first"


def test_nested_list_items_are_flattened_but_not_lost():
    requests = markdown_to_requests("- a\n  - b\n- c")
    text = plain_text_of(requests)

    assert text == "a\nb\nc"
    # Every item still gets a bullet; the parent's run is split around the
    # nested one so the two ranges never overlap.
    covered = "".join(
        slice_at(text, r["range"]["startIndex"], r["range"]["endIndex"])
        for r in requests_of_kind(requests, "createParagraphBullets")
    )
    assert set("abc") <= set(covered)


def test_a_document_of_only_unsupported_constructs_still_inserts_its_text():
    requests = markdown_to_requests("---\n\n| a |\n|---|\n\n```\ncode\n```")
    assert plain_text_of(requests)


# --------------------------------------------------------------------------
# failure behaviour
# --------------------------------------------------------------------------

def test_conversion_failure_raises_the_typed_error(monkeypatch):
    import app.services.markdown_to_requests as module

    def boom(_text):
        raise ValueError("parser exploded")

    monkeypatch.setattr(module, "_PARSER", boom)
    with pytest.raises(MarkdownConversionError):
        markdown_to_requests("# anything")


def test_conversion_failure_message_contains_no_document_content(monkeypatch):
    import app.services.markdown_to_requests as module

    secret = "the student's private revision timetable"

    def boom(_text):
        raise ValueError(f"parser exploded on {secret}")

    monkeypatch.setattr(module, "_PARSER", boom)
    with pytest.raises(MarkdownConversionError) as excinfo:
        markdown_to_requests(f"# {secret}")

    # This message reaches a log line, so it must name the failure, not the doc.
    assert secret not in str(excinfo.value)
    assert "ValueError" in str(excinfo.value)


# --------------------------------------------------------------------------
# insert_index is honoured
# --------------------------------------------------------------------------

def test_a_non_default_insert_index_shifts_every_range():
    at_one = markdown_to_requests("# T", insert_index=1)
    at_fifty = markdown_to_requests("# T", insert_index=50)

    assert at_fifty[0]["insertText"]["location"]["index"] == 50
    shifted = at_fifty[1]["updateParagraphStyle"]["range"]
    original = at_one[1]["updateParagraphStyle"]["range"]
    assert shifted["startIndex"] == original["startIndex"] + 49
    assert shifted["endIndex"] == original["endIndex"] + 49


# --------------------------------------------------------------------------
# bullet ranges must never overlap
# --------------------------------------------------------------------------

OVERLAP_CASES = [
    "- a\n- b",
    "- a\n  - b\n- c",
    "1. a\n   - b\n2. c",
    "- a\n\n  - b\n\n  c\n\n- d",
    "- a\n  1. b\n  2. c\n- d",
    "1. a\n2. b\n\ntext\n\n- c\n- d",
    "- a\n  - b\n    - c\n      - d",
]


@pytest.mark.parametrize("markdown", OVERLAP_CASES)
def test_bullet_ranges_never_overlap(markdown):
    # Two createParagraphBullets covering the same paragraph means the later
    # one silently wins and a list renders with the wrong glyph.
    requests = markdown_to_requests(markdown)
    ranges = [
        (r["range"]["startIndex"], r["range"]["endIndex"])
        for r in requests_of_kind(requests, "createParagraphBullets")
    ]
    for i, (a_start, a_end) in enumerate(ranges):
        for b_start, b_end in ranges[i + 1:]:
            assert a_end <= b_start or b_end <= a_start, (
                f"overlapping bullet ranges {(a_start, a_end)} and {(b_start, b_end)} "
                f"for {markdown!r}"
            )


@pytest.mark.parametrize("markdown", OVERLAP_CASES)
def test_every_list_item_text_survives(markdown):
    text = plain_text_of(markdown_to_requests(markdown))
    for letter in "abcd":
        if f" {letter}" in markdown or f".{letter}" in markdown:
            assert letter in text, f"list item {letter!r} lost from {markdown!r}"


def test_nested_list_between_two_blocks_keeps_its_own_preset():
    # The parent's run must be split around the nested list, not span it.
    markdown = "1. first\n\n   - nested\n\n   tail\n\n2. second"
    requests = markdown_to_requests(markdown)
    text = plain_text_of(requests)

    covered = {}
    for r in requests_of_kind(requests, "createParagraphBullets"):
        segment = slice_at(text, r["range"]["startIndex"], r["range"]["endIndex"])
        for line in segment.split("\n"):
            covered[line] = r["bulletPreset"]

    assert covered["nested"] == "BULLET_DISC_CIRCLE_SQUARE"
    assert covered["first"] == "NUMBERED_DECIMAL_ALPHA_ROMAN"
    assert covered["second"] == "NUMBERED_DECIMAL_ALPHA_ROMAN"
