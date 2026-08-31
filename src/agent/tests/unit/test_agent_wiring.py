"""The agent is wired to the tools it is told about, and to the right model.

Registering a tool and authorizing it in the prompt are two separate steps,
and neither fails loudly when the other is missing: a tool the prompt never
mentions is simply never called, which looks like the model deciding not to.
These pin both halves.
"""

from app.agent import root_agent
from app.util import load_prompt

EXPECTED_TOOLS = ["send_text", "call_student", "get_call_result"]


def _tool_names(tools) -> list[str]:
    # getattr so this reads the same under the ADK stub and the real thing.
    return [getattr(tool, "__name__", str(tool)) for tool in tools]


def test_root_agent_exposes_the_three_tools():
    assert _tool_names(root_agent.tools) == EXPECTED_TOOLS


def test_the_prompt_authorizes_the_call_tools():
    prompt = load_prompt()

    for name in ("call_student", "get_call_result"):
        assert name in prompt, f"{name} is registered but never mentioned in the prompt"


def test_the_model_is_unchanged():
    # CLAUDE.md makes this a hard rule; this turns it into a tripwire rather
    # than a convention someone has to remember.
    assert root_agent.model == "gemini-flash-latest"
