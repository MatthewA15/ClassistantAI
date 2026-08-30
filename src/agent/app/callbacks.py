"""Agent callbacks for the Classistant agent."""

import logging
import random

from google.adk.agents.callback_context import CallbackContext
from google.adk.sessions.state import State
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse

logger = logging.getLogger(__name__)

# Session-scoped state keys (plain keys = per-session).
_TURN_COUNT_KEY = "memory_reminder_turn_count"
_NEXT_THRESHOLD_KEY = "memory_reminder_next_threshold"
_MEMORY_REMINDER = (
    "It has been a while since you reviewed the conversation "
    "for anything worth remembering. Look back at the recent exchange and "
    "save any important user facts, preferences, reminders, schedules, or "
    "your own learnings to long-term memory using the save_to_memory tool. "
    "Only save what is genuinely useful. Don't save trivial details."
)

# Threshold window for the memory nudge.
_MIN_TURNS = 10
_MAX_TURNS = 30


def reset_turn_counter(state: State) -> None:
    """Reset the memory-nudge turn counter and roll a fresh threshold.

    Called after the agent saves to memory so the next nudge interval
    starts counting from zero.
    """

    state[_TURN_COUNT_KEY] = 0
    state[_NEXT_THRESHOLD_KEY] = random.randint(_MIN_TURNS, _MAX_TURNS)


def memory_nudge_callback(
    callback_context: CallbackContext,
    llm_request: LlmRequest,
) -> LlmResponse | None:
    """``before_model_callback`` that periodically nudges the LLM to save memory.

    Counts model turns in session state and, every 10-50 turns (re-rolled
    at random after each nudge), appends a reminder to the system
    instruction prompting the model to consider persisting important facts
    to long-term memory.

    Returns ``None`` so the model call proceeds with the (possibly amended)
    request.
    """
    state = callback_context.state

    # Initialize the next threshold on the first turn.
    threshold = state.get(_NEXT_THRESHOLD_KEY)
    if threshold is None:
        threshold = random.randint(_MIN_TURNS, _MAX_TURNS)
        state[_NEXT_THRESHOLD_KEY] = threshold

    count = state.get(_TURN_COUNT_KEY, 0) + 1
    state[_TURN_COUNT_KEY] = count

    if count >= threshold:
        llm_request.append_instructions([_MEMORY_REMINDER])
        logger.info(
            "memory_nudge_callback: injected memory reminder after %d "
            "turns (threshold was %d)",
            count,
            threshold,
        )
        # Reset for the next randomized interval.
        reset_turn_counter(state)

    return None
