# Skill Evolution

Evidence-driven skill and harness evolution for Codex, Claude Code, Hermes, Antigravity, OpenAI Agent Skills, and compatible agents.

Repository: https://github.com/rwang23/skill-evolution

This skill helps an agent improve skills from real work: full sessions, user feedback, failures, tool outputs, reports, traces, evals, hook events, and external research. It is designed around reviewable evolution, not uncontrolled self-modification.

## What It Does

- Reads back full sessions instead of relying only on final summaries.
- Distills durable lessons from user corrections, repeated failures, and successful fixes.
- Decides whether to patch `SKILL.md`, a reference file, a script, or an eval/checker.
- Supports portable Agent Skills folders with `SKILL.md`, `scripts/`, and `references/`.
- Documents safe hook patterns: capture evidence, propose changes, apply only after approval.
- Includes a configurable session extractor for Codex, Claude-style JSONL, generic JSONL/JSON, Markdown, and plain text transcripts.
- Adds a runnable proposal generator and package validator for PR-gated skill evolution.

## Install

Clone the public repository first:

```bash
git clone https://github.com/rwang23/skill-evolution.git /tmp/skill-evolution
```

macOS/Linux:

```bash
mkdir -p ~/.codex/skills ~/.claude/skills ~/.hermes/skills
cp -R /tmp/skill-evolution ~/.codex/skills/
cp -R /tmp/skill-evolution ~/.claude/skills/
cp -R /tmp/skill-evolution ~/.hermes/skills/
```

Windows PowerShell:

```powershell
$Repo = Join-Path $env:TEMP "skill-evolution"
git clone https://github.com/rwang23/skill-evolution.git $Repo

# Codex
Copy-Item -Recurse $Repo "$env:USERPROFILE\.codex\skills\"

# Claude Code, if configured to read user skills from this location
Copy-Item -Recurse $Repo "$env:USERPROFILE\.claude\skills\"

# Hermes
Copy-Item -Recurse $Repo "$env:USERPROFILE\.hermes\skills\"
```

For other Agent Skills-compatible tools, place the cloned `skill-evolution` folder wherever that tool scans skills. If a previous copy exists, back it up or inspect local changes before overwriting.

## Ask an Agent to Install It

Copy this prompt to an agent that has shell and Git access:

```text
Install the public Agent Skill repository https://github.com/rwang23/skill-evolution into my local agent skills directory.

Requirements:
- Clone `https://github.com/rwang23/skill-evolution.git` into a temporary directory.
- Copy the `skill-evolution` folder into the skills directory for my active agent:
  - Codex: `$CODEX_HOME/skills` or `$HOME/.codex/skills`
  - Claude Code: `$HOME/.claude/skills`
  - Hermes: `$HOME/.hermes/skills`
  - Windows equivalents should use `%USERPROFILE%` or `$env:USERPROFILE`.
- Run `node scripts/validate-skill-package.js <installed-skill-dir>`.
- If Codex's skill-creator validator exists locally, also run `quick_validate.py`.
- Do not overwrite a dirty existing copy. Back it up or ask first.
- Report the installed path and validation output.
```

## Use

Ask your agent to use the skill explicitly:

```text
Use $skill-evolution to review recent sessions, convert recurring feedback into evals, and propose safe skill or harness improvements.
```

Natural-language triggers should also work when the agent has indexed this skill: "skill upgrade", "self-improving agent", "skill optimization", "agent harness", "loop engineering", "hook-based skill update", "技能进化", "技能升级", "自我更新", or "自我改进".

Or run the transcript extractor directly:

```bash
node ./scripts/extract-session.js --agent codex --cwd "$PWD" --max-messages 120 --include-tool-output
node ./scripts/extract-session.js --session-dir ~/path/to/sessions --query "user correction" --format json
```

## Safety Model

The recommended loop is:

1. Capture evidence.
2. Produce a proposed diff with citations.
3. Validate the changed skill.
4. Apply locally or open a draft PR only after review.

Automatic hooks should write proposals, not silently mutate skills.

## Hook or Scheduled Review

Run this after long sessions, from a Claude Code hook, from a Codex wrapper, from cron/systemd, or from a CI job:

```bash
node ./scripts/propose-skill-evolution.js \
  --agent codex \
  --cwd "$PWD" \
  --skill-dir .
```

The output goes to `~/.agent-skill-evolution/proposals/` unless `--output-dir` is provided.

## Hook Install Shapes

Claude Code:

```bash
node "$HOME/.codex/skills/skill-evolution/scripts/propose-skill-evolution.js" \
  --agent claude \
  --session-dir "$HOME/.claude/projects" \
  --cwd "$PWD" \
  --skill-dir "$HOME/.codex/skills/skill-evolution"
```

Linux cron or systemd timer:

```bash
SKILL_DIR="$HOME/.codex/skills/skill-evolution"
node "$SKILL_DIR/scripts/propose-skill-evolution.js" \
  --agent codex \
  --session-dir "$HOME/.codex/sessions" \
  --skill-dir "$SKILL_DIR"
```

Windows PowerShell scheduled task command:

```powershell
$SkillDir = "$env:USERPROFILE\.codex\skills\skill-evolution"
node "$SkillDir\scripts\propose-skill-evolution.js" `
  --agent codex `
  --session-dir "$env:USERPROFILE\.codex\sessions" `
  --skill-dir "$SkillDir"
```

## Validate

```bash
node ~/.codex/skills/skill-evolution/scripts/validate-skill-package.js ~/.codex/skills/skill-evolution
python ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py ~/.codex/skills/skill-evolution
```

## License

MIT
