# Evolution Loop

Use this reference when designing repeatable skill improvement, hooks, recurring reviews, or public publishing workflows.

## First Principles

A good self-optimization system needs:

1. **Evidence**: real sessions, user corrections, failing commands, diffs, tests, web research, and final outcomes.
2. **Attribution**: every proposed rule should point to the evidence that motivated it.
3. **Feedback-to-eval conversion**: turn recurring human feedback into replay prompts, checkers, or acceptance criteria.
4. **Generalization test**: separate durable workflow lessons from one-off project state.
5. **Candidate diff**: produce the smallest patch that would prevent or shorten the failure.
6. **Evaluation**: run structural validation plus at least one realistic scenario.
7. **Approval boundary**: broad behavior changes should be reviewed before being applied.
8. **Versioning**: commit or package changes so regressions can be compared and rolled back.

## Evidence Review Cadence

Use the lightest cadence that catches meaningful drift:

- Immediate: after strong user correction, repeated failure, or a long complex session.
- Daily or weekly: scan recent sessions for repeated failure categories.
- Release-time: before publishing or syncing skills across agent scopes.
- Incident-time: after a bad deploy, destructive near miss, public copy error, or repeated verification miss.

## Hook Architecture

Hooks should normally be non-destructive:

1. Capture raw event context or a pointer to the transcript.
2. Run a fast classifier for "possible skill lesson".
3. Append a proposal record under a review folder.
4. Let a human or trusted agent run the apply step.

Suggested local proposal shape:

```json
{
  "timestamp": "2026-07-02T00:00:00Z",
  "agent": "codex",
  "source": "session path or URL",
  "skill": "skill-evolution",
  "lesson": "short generalizable lesson",
  "evidence": ["exact user correction", "failing command", "final fix"],
  "target": "SKILL.md or references/file.md",
  "validation": ["quick_validate", "script smoke test"],
  "status": "proposed"
}
```

## Candidate Scoring

Before applying a change, score it:

| Question | Good sign | Bad sign |
| --- | --- | --- |
| Does it generalize? | repeated across sessions or likely future task | single transient state |
| Is it scoped? | one skill section or one script option | broad behavioral rewrite |
| Is it measurable? | validation command or scenario exists | subjective preference only |
| Is it portable? | no hard-coded project/version/date | tied to one report version |
| Is it reversible? | clean diff and commit | hidden mutation or side effect |

Reject or defer low-scoring changes.

## Candidate Pool

For difficult improvements, keep more than one candidate:

1. Baseline: current skill.
2. Safety candidate: more guardrails, fewer assumptions.
3. Speed candidate: fewer steps, better routing, better scripts.
4. Quality candidate: richer evals or references.

Score candidates separately on correctness, safety, portability, token cost, and operational overhead. Accept the smallest candidate that improves the target metric without regressing required constraints.

## Human Feedback Loop

Treat human corrections as the highest-signal training data:

1. Preserve the exact correction.
2. Identify what the agent would have needed to know earlier.
3. Decide whether that knowledge belongs in the skill, a reference, a script, or a harness hook.
4. Add an eval/check that would catch the same miss.
5. Report the before/after behavior in the proposal.

## Session Back-Reading

When a session was compressed, read backward:

1. Start from the final report or memory entry.
2. Open the rollout summary that points to the raw transcript.
3. Extract exact user messages, assistant decisions, tool failures, and final changes.
4. Sample earlier turns around repeated corrections.
5. Write the lesson in a reusable form, not as a session diary.

Use `scripts/extract-session.js` with `--query` for focused review and `--include-tool-output` when failures matter.

## Public Skill Publishing

For a public repository:

1. Keep `SKILL.md`, `scripts/`, `references/`, and `README` files self-contained.
2. Remove machine-specific secrets and private path assumptions from public docs.
3. Include explicit install paths for Codex, Claude Code, Hermes, and generic Agent Skills.
4. Include validation commands and examples.
5. Use a normal GitHub review flow. Do not publish from a dirty private config repo without a clean export.

## Non-Goals

- Do not train a model.
- Do not let hooks silently rewrite production skills.
- Do not encode every user preference as a global rule.
- Do not optimize for novelty over repeatable correctness.
