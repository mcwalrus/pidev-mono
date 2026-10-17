
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
- Keep `README.md` human readable. Explain relevant packages with summaries

**APIs**

* Context exposed to agents via extensions should be minimal
* Consider elegance and usability of how models see tool-calls
## Tools

- npm + justfile
- CI - GitHub workflows
- Releases - never push unless told

## Workflow

**First, always call** 

* `read README.md`
* `read docs docs/extensions.md`

**Workflow guidelines**

- Stay on the `main` branch, avoid branching off.
- No issue-tracker is used, refer to markdown and update tickboxes as you go
- Tasks are tracked under `tasks/<package>/tickets` where git init should be set within
- Use commits to track changes only when checkboxes are updated (user to commit spec)
- You can refer to source code at `$HOME/repos/github.com/earendil-works/pi`
- Multiple agents maybe working on the repo at one time

Pull the latest version of `earendil-works/pi`

## Specs

When generating user stories consider both the *'PI user'* but also the *'PI agent'*. The needs for the two are very different. The user will value the ergonomics, usability and visibility of what extensions are used for. Agent needs are likely to be your own, as given by the use-case.

## Packages

List of local packages helpful for local development:

*packages/term-image/skills/term-image*

Agent-first terminal capture a tmux pane in a PNG out which ships a CLI. This package should help for interactive development of pi.dev extension-based changes. pi.dev development can validate the TUI experience via the `VirtualTerminal` backend which uses `@xterm/headless` to provide a cell-grid emulator, but only for development directly on the pi.dev harness itself.

Use this after changes to TUI based-extension updates and report feedback on improvements.
