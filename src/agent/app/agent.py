from google.adk.agents.llm_agent import Agent
from google.adk.apps import App

from .tools import send_text
from .util import load_prompt
from .api import build_connector_api, inject_user_id

_tools: list = [send_text]
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
