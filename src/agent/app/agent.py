from google.adk.agents.llm_agent import Agent
from google.adk.apps import App

from .tools import send_text
from .tools_calls import call_student, get_call_result
from .util import load_prompt

root_agent = Agent(
    model='gemini-flash-latest',
    name='classy',
    description="You are Classy, Classistant's main agent.",
    instruction=load_prompt(),
    tools=[send_text, call_student, get_call_result],
)

app = App(
    root_agent=root_agent,
    name="app",
)
