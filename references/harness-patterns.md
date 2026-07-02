# Harness Patterns

Use this reference when the improvement target is not only a `SKILL.md` file, but the surrounding agent harness.

## Harness Definition

Treat the harness as everything around the model:

- context assembly and skill routing;
- session, memory, and trace capture;
- tool execution and error handling;
- loop stop conditions and budgets;
- evals, validators, and score thresholds;
- approval, PR, and rollback workflow;
- telemetry and proposal archives.

Skill evolution should improve the harness when an instruction alone cannot make the behavior reliable.

## Pattern Library

| Pattern | Use when | Artifact |
| --- | --- | --- |
| Trace-first improvement | The failure is only visible in full execution history | transcript extractor, trace link, evidence proposal |
| Feedback-to-eval | User correction is likely to recur | eval prompt, checker script, replay fixture |
| Candidate pool | Several variants may work | proposal folder with candidate diffs and scores |
| Pareto selection | One variant improves safety while another improves speed or quality | scorecard with multiple metrics |
| PR-gated self-modification | Public or shared skill behavior changes | branch, draft PR, validation log |
| Hooked proposal | Long tasks should trigger review automatically | hook command writing proposal files |
| Harness patch | The agent needs better context, tools, or stop conditions | wrapper/hook/config update |
| Regression archive | A fixed failure must stay fixed | fixture, replay transcript, expected output |

## GEPA-Inspired Candidate Loop

Use a small candidate loop for high-value skill changes:

1. Select one baseline skill version.
2. Replay a minibatch of session snippets or task prompts.
3. Capture full traces and failures.
4. Ask the agent to reflect on failures in natural language.
5. Generate one minimal mutation.
6. Run the same evals against baseline and candidate.
7. Accept only if the candidate improves the chosen metrics without violating constraints.
8. Keep rejected candidates as notes only when they explain a useful failure mode.

Do not run large evolutionary loops by default. Skill files are high-leverage and should stay small.

## BerriAI-Inspired Approval Surface

Keep the tool surface narrow:

1. `propose-skill-evolution.js` generates a structured proposal.
2. A human or trusted maintainer approves the target and scope.
3. An agent creates the minimal diff.
4. Validators and evals run.
5. A draft PR is opened for shared/public repositories.

This keeps self-improvement inspectable instead of hidden in a long conversation.

## Evals for Skills

Prefer practical evals:

- Trigger eval: would the skill be selected for this user request?
- Process eval: did the agent read the right reference and use the right script?
- Artifact eval: did the generated file/report/code meet requirements?
- Regression eval: did a previous user correction stay fixed?
- Portability eval: does the package pass without private paths on macOS, Linux, and Windows examples?

Every broad skill change should add or update at least one eval expectation, even if the eval is a small manual checklist.

## Loop Controls

Bound the loop:

- budget: max candidates, max transcript size, max runtime;
- stop condition: no score improvement, no durable lesson, or no validation target;
- safety gate: no secrets, no production mutation, no public push without approval;
- drift control: compare against baseline and preserve rollback commits;
- noise control: ignore system/developer boilerplate unless the skill is about agent runtime policy.
