# Automation Playbook

Use this reference to wire `skill-evolution` into hooks, scheduled reviews, or PR-gated workflows.

## Architecture

Model the loop after three systems:

- Hermes: create or update skills after complex tasks, error recovery, user correction, or non-trivial workflow discovery.
- Hermes self-evolution: use traces to generate candidates, evaluate candidates, enforce constraints, then route the best variant to review.
- BerriAI self-improving-agent: expose a small tool surface, propose a minimal diff, require human approval, then open a draft PR.

Portable loop:

1. **Capture**: collect transcript path, agent, cwd, changed files, tool-call count, errors, and user corrections.
2. **Score**: decide whether the session has enough signal to propose a skill change.
3. **Propose**: write a JSON + Markdown proposal with evidence and target files.
4. **Generate candidate**: let an agent produce the smallest diff against the relevant skill.
5. **Evaluate**: run `validate-skill-package.js`, syntax checks, trigger checks, and task-specific evals.
6. **Approve**: human or trusted maintainer accepts the diff.
7. **Apply**: commit locally or open a draft PR. Never silently publish.

## Trigger Signals

Create a proposal when any of these are true:

- The session used at least 5 tool calls and ended successfully.
- The agent recovered from an error, dead end, wrong assumption, or failed verification.
- The user corrected the agent's process.
- The agent discovered a repeatable workflow.
- A long-running task was compressed or handed off.
- A skill was explicitly invoked but missed an expected step.

Do not propose a skill update for one-off project state, secrets, transient counts, or purely subjective preference unless it repeats.

## Proposal Format

`scripts/propose-skill-evolution.js` writes:

- `*.json`: machine-readable proposal.
- `*.md`: human review summary.

Keep proposal files outside the skill by default under `~/.agent-skill-evolution/proposals/`. This avoids dirtying the skill repository on every session.

## Claude Code Hook

Claude Code supports lifecycle hooks. Use `SessionEnd` or `Stop` for proposal generation.

Example command shape:

```bash
node "$HOME/.codex/skills/skill-evolution/scripts/propose-skill-evolution.js" \
  --agent claude \
  --session-dir "$HOME/.claude/projects" \
  --cwd "$PWD" \
  --skill-dir "$HOME/.codex/skills/skill-evolution"
```

On Windows PowerShell:

```powershell
node "$env:USERPROFILE\.codex\skills\skill-evolution\scripts\propose-skill-evolution.js" `
  --agent claude `
  --session-dir "$env:USERPROFILE\.claude\projects" `
  --cwd (Get-Location).Path `
  --skill-dir "$env:USERPROFILE\.codex\skills\skill-evolution"
```

The hook should run in proposal-only mode. A separate review step applies changes.

## Codex Wrapper

If the runtime does not expose a native end-of-session hook, wrap long tasks:

```bash
codex exec --json "$PROMPT" > .agent-run.jsonl
node ~/.codex/skills/skill-evolution/scripts/propose-skill-evolution.js \
  .agent-run.jsonl \
  --agent codex \
  --skill-dir ~/.codex/skills/skill-evolution
```

For interactive app sessions, use a scheduled local review that scans recent sessions and writes proposals.

## Hermes Workflow

Hermes already has agent-managed skills. Use this skill as an external review layer when you want stricter gates:

1. Let Hermes create or update a local skill from experience.
2. Export or point to the trace/session history.
3. Run proposal generation and validation.
4. Commit or PR the accepted skill change.

Do not bypass Hermes' write-approval gate when the change is broad.

## Linux or Server Deployment

Use `$HOME` and absolute paths resolved at runtime:

```bash
SKILL_DIR="${XDG_DATA_HOME:-$HOME/.codex}/skills/skill-evolution"
node "$SKILL_DIR/scripts/propose-skill-evolution.js" --session-dir "$HOME/.codex/sessions"
```

Run this from cron, systemd timers, CI, or a post-run wrapper. Keep credentials for PR creation in the host's normal secret store, not in the skill.

## PR-Gated Publishing

To follow the BerriAI-style safety model:

1. Generate proposal.
2. Have an agent create the minimal diff.
3. Run validators and evals.
4. Create a branch.
5. Open a draft PR with evidence and validation output.
6. Merge only after review.

The skill may prepare commands, but the user must approve public repository creation, token use, pushing, or PR opening.
