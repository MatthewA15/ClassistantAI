from google.adk.agents.llm_agent import Agent
from google.adk.apps import App

from .util import load_prompt

root_agent = Agent(
    model='gemini-3.5-flash',
    name='root_agent',
    description='A helpful assistant for user questions.',
    instruction=load_prompt(),
)

app = App(
    root_agent=root_agent,
    name="app",
)
