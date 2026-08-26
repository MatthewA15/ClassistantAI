"""Utility helpers for the classistant agent package."""

from pathlib import Path


def load_prompt(filename: str = "prompt.md") -> str:
    """Load a prompt markdown file from this package directory as a string.

    Args:
        filename: Name of the markdown file located alongside the agent
            module (e.g. ``prompt.md``).

    Returns:
        The file contents as a (stripped) string.

    Raises:
        FileNotFoundError: If the requested file does not exist.
    """
    file_path = Path(__file__).resolve().parent / filename
    return file_path.read_text(encoding="utf-8").strip()
