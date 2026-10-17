# @pidev/self-help

Advertises installed Pi extension packages to the agent, so it knows what
documentation exists before you ask.

The extension resolves the npm packages declared in Pi's effective settings and
contributes one byte-bounded `extensions` section to the system prompt naming
each package and the location of its `package.json` and `README.md`. The agent
reads a README with the ordinary `read` tool.

See the package README for the resolution rules and the `/self-help` command.
