# Research Sources

Use this reference when you need the rationale behind the skill design or when refreshing the research.

## Source Map

| Source | Useful lesson |
| --- | --- |
| OpenAI Codex Agent Skills docs: https://developers.openai.com/codex/skills | Skills are reusable workflow folders with `SKILL.md`, optional scripts/references/assets, progressive disclosure, and description-driven triggering. |
| OpenAI agent improvement loop: https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop | Build a flywheel from real traces, human/model feedback, evals, and Codex-implemented harness changes. |
| Agent Skills standard: https://agentskills.io/home | Agent Skills are a lightweight open format meant for cross-product reuse and version-controlled workflows. |
| Claude Code hooks docs: https://code.claude.com/docs/en/hooks | Hooks can run at lifecycle events such as session start/end, prompt submit, stop, and tool use. Use them for deterministic capture or proposal generation. |
| Hermes skills docs: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills | Hermes keeps skills under `~/.hermes/skills/`, supports progressive disclosure, and treats skills as a primary learning surface. |
| Hermes self-evolution repo: https://github.com/NousResearch/hermes-agent-self-evolution | The strong pattern is trace-driven candidate generation, constraint gates, semantic preservation, and PR review rather than direct mutation. |
| BerriAI self-improving-agent: https://github.com/BerriAI/self-improving-agent | The useful safety surface is small tools, minimal diffs, explicit human approval, and draft PR creation instead of prompt-only self-modification. |
| GEPA project: https://github.com/gepa-ai/gepa | Read full execution traces, reflect on failures, mutate candidates, and keep a Pareto-aware pool instead of trusting one scalar score. |
| GEPA overview: https://gepa-ai.github.io/gepa/ | Candidate selection -> minibatch traces -> reflection -> mutation -> accept-if-improved is a practical template for bounded skill evolution. |
| Harness engineering: https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering | Self-verification, tracing, context optimization, and harness changes can improve agents without changing the underlying model. |
| Agent harness framing: https://addyosmani.com/blog/agent-harness-engineering/ | The harness is state, tool execution, feedback loops, and enforceable constraints around the model. |
| Claude skill best practices: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices | Build evals before large docs; use representative failures to drive minimal instructions. |
| OpenAI skill eval guide: https://developers.openai.com/blog/eval-skills | Treat evals as prompt -> trace/artifacts -> checks -> score, including trigger behavior and process checks. |
| Antigravity skills codelab: https://codelabs.developers.google.com/getting-started-with-antigravity-skills | Antigravity supports Agent Skills as modular capabilities; self-improvement still needs session/memory capture and an adapter workflow. |
| Antigravity memory discussion: https://discuss.ai.google.dev/t/how-i-built-a-persistent-memory-system-for-antigravity-with-start-workflow-session-management-lazygravity/128640 | Practical memory systems start with small persistent files, session recaps, and a start workflow before adding heavy automation. |

## Distilled Design Rules

1. Keep the skill portable first; put runtime-specific behavior in references or adapters.
2. Prefer progressive disclosure: short `SKILL.md`, direct references for variants, scripts for deterministic work.
3. Use full sessions and traces, not only final reports.
4. Turn hooks into proposal writers by default.
5. Validate candidate changes with structure checks, script checks, and at least one realistic scenario.
6. Use reviewable commits or PRs for any broad change.
7. Do not hard-code project versions, report names, or dates unless the script is explicitly about that exact artifact.
8. Treat community skepticism as a design constraint: self-improvement without evals, traces, rollback, and human oversight is usually drift, not learning.
9. Optimize the harness when better context, tools, hooks, or telemetry would prevent repeated failures more reliably than more prose.
