from google.adk.agents.llm_agent import Agent
from google.adk.apps import App
from google.adk.tools.preload_memory_tool import PreloadMemoryTool

from .tools import send_text, search_memories, save_to_memory
from .util import load_prompt
from .api import build_connector_api, inject_user_id

_tools = [PreloadMemoryTool(), search_memories, save_to_memory, send_text]
if (connector_api := build_connector_api()) is not None:
    _tools.append(connector_api)

root_agent = Agent(
    model='gemini-flash-latest',
    name='classy',
    description="You are Classy, Classistant's main agent.",
    instruction=load_prompt(),
    tools=_tools,
    before_tool_callback=inject_user_id,
)

app = App(
    root_agent=root_agent,
    name="app",
)
