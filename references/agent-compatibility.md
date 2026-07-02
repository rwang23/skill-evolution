# Agent Compatibility

Use this reference when optimizing skills across multiple agent runtimes.

## Portable Core

Use the open Agent Skills shape as the portable baseline:

- `SKILL.md` with frontmatter `name` and `description`.
- Optional `scripts/` for deterministic operations.
- Optional `references/` for long or variant-specific guidance.
- Optional `assets/` for templates or output resources.

Keep the portable skill logic in the skill folder. Keep runtime-specific wiring in small adapters, hooks, or setup notes.

## Codex and OpenAI Skills

Codex skills are discovered from installed skill folders and selected by name plus description. Codex loads `SKILL.md` only when a task matches. Use concise frontmatter descriptions because the initial skill list can be truncated when many skills are installed.

Evidence sources on this machine:

Portable evidence sources:

- Raw Codex sessions: `$CODEX_HOME/sessions/` or `$HOME/.codex/sessions/`
- Memory index: `$CODEX_HOME/memories/MEMORY.md` or `$HOME/.codex/memories/MEMORY.md`
- Rollout summaries: `$CODEX_HOME/memories/rollout_summaries/`
- User-level skill roots: `$HOME/.codex/skills/`, `$HOME/.claude/skills/`, `$HOME/.agents/skills/`, or runtime-specific equivalents

Codex does not need a native hook to run this skill manually. For automatic review, use a separate local automation or wrapper that calls the extractor and writes a proposal file.

## Claude Code

Claude Code has lifecycle hooks such as session, prompt, stop, and tool-use events. Treat hooks as deterministic capture or enforcement points.

Recommended use:

- `SessionEnd` or `Stop`: append a compact session summary or trigger a background proposal job.
- `PostToolUse`: capture repeated tool failures or verification misses.
- `UserPromptSubmit`: inject a reminder only when a project requires it.

Keep hook commands in standalone scripts instead of large inline config. The hook should write evidence or a proposal, not directly rewrite skills without review.

Claude Code sessions are commonly project-scoped JSONL transcripts under a user home project-session directory. Prefer an explicit `--session-dir` or explicit session file path when exact local layout differs.

## Hermes

Hermes treats skills as first-class, on-demand knowledge documents and keeps its primary source under `~/.hermes/skills/`. Hermes can also use additional external skill directories.

Hermes self-evolution is the strongest model to learn from:

- use real traces or generated eval data;
- generate candidate skill variants;
- evaluate candidates against constraints;
- preserve purpose and size limits;
- open a reviewable PR instead of committing directly.

For this skill, mirror that pattern without requiring Hermes: collect traces, create a candidate diff, run validation, and require review for broad changes.

## Google Antigravity

Antigravity supports Agent Skills as a lightweight workflow format. It is useful as an orchestration surface across agents, but persistent self-improvement usually needs an explicit memory/session layer.

Recommended pattern:

- Keep portable skills in a normal Agent Skills folder.
- Use `GEMINI.md`, project rules, or the platform's memory/start workflow to tell agents where skills and session recaps live.
- Record session recaps and task trajectories so this skill can review them later.

Do not assume Antigravity has the same hook model as Claude Code. Use adapter scripts and exported transcripts unless current platform docs prove a native event is available.

## Other Agents

For any new runtime, add an adapter only after identifying:

1. Where full sessions or traces are stored.
2. How skills/instructions are discovered.
3. Whether the runtime supports hooks, wrappers, or scheduled jobs.
4. Which operations can be automatic and which require approval.
5. How to validate the edited skill before reuse.

If any of these are unknown, support the runtime through explicit transcript files first.
