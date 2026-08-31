"""The classy-browser agent.

A headless browser-automation agent. classistant-agent (Classy) delegates
web tasks to this agent via A2A.

Design notes:
- obscura MCP provides the actual browser; each student's session runs in
  their own obscura process with an isolated --storage-dir (see
  browser_tools.py).
- Credentials flow exclusively through the placeholder protocol in
  callbacks.py: the model emits `<%USERNAME%>`/`<%PASSWORD%>`, real values
  are injected just before the tool runs and scrubbed from the result just
  after. The model never sees the plaintext.
"""

import pathlib

from google.adk.agents.llm_agent import Agent
from google.adk.apps.app import App
from google.adk.skills import load_skill_from_dir
from google.adk.tools import skill_toolset

from .browser_tools import PerUserBrowserToolset
from .callbacks import inject_credentials, scrub_credentials
from .util import load_prompt

beartracks_sso_login_skill = load_skill_from_dir(
    pathlib.Path(__file__).parent / "skills" / "beartracks-sso-login"
)


root_agent = Agent(
    model="gemini-flash-latest",
    name="classy_browser",
    description="You browse the web for students.",
    instruction=load_prompt(),
    tools=[
        PerUserBrowserToolset(),
        skill_toolset.SkillToolset(
            skills=[beartracks_sso_login_skill]
        )
    ],
    before_tool_callback=inject_credentials,
    after_tool_callback=scrub_credentials,
)

app = App(
    root_agent=root_agent,
    name="browser_agent",
)
