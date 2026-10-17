
# pidev-mono

A monorepo for Pi Agent CLI extensions for @earendil-works/pi-coding-agent.

## Rules

**Conversational style**

- Technical prose only, be direct
- No emojis in commits, issues, PR comments, or code
- Concise, clear, simple language; define unavoidable jargon before use
- British English spelling

**Do's**

- Ask questions early
- Avoid including comments in code
- Consider event lifecycle of the agent harness
- Propose updates to local extensions used when challenged

## Tools

- Recipes - npm + justfile
- CI - GitHub workflows
- Releases - never push unless told

## Workflow

First, call: `read docs docs/extensions.md`

* No issue-tracker is used, refer to markdown and update tickboxes as you go.
* Tasks are tracked under `tasks/<package>/...` where a git init should be set under each.
* Use commits to track changes only when checkboxes are updated (user to commit spec)
* You can refer to source code at `$HOME/repos/github.com/earendil-works/pi`
* Multiple agents maybe working on the repo so avoid branches

Pull the latest version from the repo prior.

## Packages

List of local packages helpful for local development:

*packages/term-image/skills/term-image*

Agent-first terminal capture a tmux pane in a PNG out which ships a CLI. This package should help for interactive development of pi.dev extension-based changes. pi.dev development can validate the TUI experience via the `VirtualTerminal` backend which uses `@xterm/headless` to provide a cell-grid emulator, but only for development directly on the pi.dev harness itself.

Use this after changes to TUI based-extension updates and report feedback on improvements.
















