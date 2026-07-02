---
name: skill-evolution
description: Runnable skill and harness evolution for Codex, Claude Code, Hermes, Antigravity, OpenAI skills, and compatible agents. Use when the user asks to improve, evolve, audit, publish, or create skills from full sessions, traces, evals, human feedback, Reddit/GitHub/community research, failures, corrections, repeated workflow patterns, hook events, or PR-gated self-improvement loops.
---

# Skill Evolution

Use this skill to turn real agent experience into safer, better skills and harnesses. The goal is a runnable evolution loop: detect learning signals, extract evidence, propose a minimal change, validate it with evals, and route it through approval or PR. Do not treat self-evolution as permission for unbounded autonomous edits.

## Operating Model

Optimize skills with a closed loop:

1. **Detect a signal** from a long task, 5+ tool calls, error recovery, user correction, repeated failure, non-trivial workflow discovery, or explicit optimization request.
2. **Collect evidence** from current chat, memory index, rollout summaries, raw session transcripts, command outputs, diffs, tests, web research, and user corrections.
3. **Convert feedback into evals** when the lesson can be checked. Prefer a small replay prompt, trigger test, script smoke test, or checker over a vague instruction.
4. **Generate a candidate proposal** with evidence links, target files, intended diff, validation commands, and risk score.
5. **Classify the lesson** before editing:
   - durable rule -> target skill `SKILL.md` or a direct reference file;
   - deterministic repeated check -> script with configurable inputs;
   - evaluation expectation -> eval/checker prompt/test case;
   - harness behavior -> hook, wrapper, telemetry, proposal, or validation script;
   - one-off project state -> report it, do not encode it as a skill rule.
6. **Read backward through sessions** when compressed summaries are not enough. Preserve exact user corrections and tool failures before generalizing.
7. **Patch the smallest durable surface** that would have prevented or shortened the failure.
8. **Validate** structure, script behavior, trigger behavior, and at least one realistic scenario.
9. **Route through approval** for broad changes. Prefer a local commit or draft PR over silent writes.

Prefer human-reviewable changes over fully automatic writes. When a change affects broad behavior, present the evidence and diff clearly.

## Evidence Intake

Use the strongest available evidence, in this order:

1. Current user feedback and explicit corrections.
2. Agent memory index, such as `$CODEX_HOME/memories/MEMORY.md` or `$HOME/.codex/memories/MEMORY.md`.
3. Relevant rollout summaries or session recaps under the agent's memory/session folder.
4. Raw sessions or exported transcripts from Codex, Claude Code, Hermes, Antigravity, OpenAI tools, or another agent.
5. Project files, tests, reports, and git history that verify the behavior.
6. External research when the user asks for current or comparative best practice.

For compressed or multi-day sessions, do not rely only on final reports. Read rollout summaries and sample raw transcripts for exact user phrases, rejected assumptions, failing commands, tool outputs, repeated corrections, and the agent's own missed opportunities.

## Session Extraction

Use the bundled extractor for readable evidence:

```bash
node ~/.codex/skills/skill-evolution/scripts/extract-session.js --agent codex --cwd "$PWD" --max-messages 120 --include-tool-output
```

For a known session:

```bash
node ~/.codex/skills/skill-evolution/scripts/extract-session.js ~/path/to/session.jsonl --include-tool-output
```

Use `--query <text>` to keep only messages containing a term when the transcript is large. Use `--session-dir <dir>` to scan a non-default location, and `--format json` when a downstream evaluator needs structured output.

## Proposal Tools

Use the proposal generator after a long task or hook event:

```bash
node ~/.codex/skills/skill-evolution/scripts/propose-skill-evolution.js \
  --agent codex \
  --cwd "$PWD" \
  --skill-dir ~/.codex/skills/skill-evolution
```

It writes a proposal under `~/.agent-skill-evolution/proposals/` by default. The proposal is a review artifact, not an automatic edit.

Validate a skill before applying or publishing:

```bash
node ~/.codex/skills/skill-evolution/scripts/validate-skill-package.js ~/.codex/skills/skill-evolution
```

Read `references/agent-compatibility.md` when working across Codex, Claude Code, Hermes, Antigravity, or OpenAI skill environments.
Read `references/evolution-loop.md` when designing hooks, recurring reviews, candidate scoring, approval gates, or PR workflows.
Read `references/automation-playbook.md` when installing hook or scheduled-review wiring.
Read `references/harness-patterns.md` when optimizing agent harnesses, telemetry, eval gates, candidate pools, or loop control.
Read `references/research-sources.md` when refreshing or citing the external research behind this skill.

## Patch Target Rules

Use the target that matches the failure:

| Failure type | Patch target |
| --- | --- |
| Triggering or routing miss | skill frontmatter `description` |
| Repeated workflow miss | `SKILL.md` workflow section |
| Detailed domain rule | direct `references/*.md` file |
| Deterministic file/count/text drift | `scripts/*` with CLI options |
| Subjective quality judgment | checker prompt or eval expectation |
| Cross-agent portability miss | compatibility reference or adapter script |
| Auto-review cadence miss | hook/automation reference, not direct autonomous editing |
| Project-only current state | project report or task note, not a reusable skill |

Keep scripts mechanical and configurable. Do not hard-code one project version, run date, report folder, account, or transient count unless that is the explicit purpose of the script.

## Hook Policy

Prefer a three-stage hook design:

1. **Capture** session metadata and evidence candidates.
2. **Propose** skill changes with citations, diffs, and validation commands.
3. **Apply** only after human approval or an explicit trusted local workflow.

Hooks may run automatically, but automatic hooks should normally write proposal files, not mutate skills. Use `references/automation-playbook.md` for cross-platform hook examples.

## Guardrails

- Do not auto-apply broad behavior changes without clear evidence and validation.
- Do not publish, create GitHub repositories, open PRs, or push branches without explicit user/account approval.
- Do not encode a single failure as a universal rule unless it generalizes.
- Do not create changelogs or extra docs inside a skill unless the user asks for a publishable package or the skill format requires them.
- Do not edit generated, vendored, bundled, or upstream-managed skills without checking the local skill provenance rules.
- Do not overwrite dirty user edits. Use path-scoped commits when committing is appropriate.
- Keep `SKILL.md` concise. Move long domain detail into direct references and load only the relevant file.
- Keep public docs portable. Do not include private usernames, local project names, secrets, or machine-specific absolute paths.
- Preserve original user wording in reports or evidence notes when it matters, but write durable rules in clear operational English.

## Validation

After changing a skill:

```bash
python ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py <skill-folder>
node <skill-folder>/scripts/validate-skill-package.js <skill-folder>
git diff --check -- <changed-files>
```

Also run at least one relevant functional check:

- script compile or smoke command for changed scripts;
- a realistic transcript extraction for this skill;
- a focused project command when the skill governs project behavior;
- a forward-test with a fresh agent only when it will not create live, destructive, public, or expensive side effects.

## Output Contract

When finished, report:

- evidence sources used;
- failures or opportunities found;
- skill files changed and why;
- validation run and result;
- remaining risks or follow-up improvements;
- commit hash if committed.
