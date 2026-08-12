---
name: skill-evolution
description: Turn repeated usage evidence and user feedback into reviewable Skill or harness improvement proposals. Use for Skill evolution, routing regressions, eval or hook improvements, and 技能进化或优化; not for applying changes or one-off edits.
---

Turn observed agent behavior into a bounded improvement proposal. This Skill is proposal-only: it collects evidence, tests whether the lesson generalizes, and produces a review artifact. It never edits the target Skill, changes a registry, commits, pushes, or opens a pull request.

Resolve this package's directory as `<skill-root>`. All required instructions, scripts, and validation rules live below that directory.

## Workflow

1. Confirm the request is about a reusable Skill or agent-harness behavior. For a one-off project correction, return `no candidate` and keep the issue local.
2. Read [the evolution quality contract](references/skill-quality-contract.md). Define the suspected failure, the target surface, the evidence threshold, and the approval boundary before proposing anything.
3. Collect the smallest decisive evidence set. Prefer exact user corrections, repeated failures, failed verification, routing misses, and before/after outcomes. Keep observed facts separate from inference.
4. When a transcript needs normalization, run `node <skill-root>/scripts/extract-session.js <session-file> --format json --include-tool-output`. Use `--query <text>` for a focused extract.
5. Test generalization. A candidate must explain a repeatable behavior, name the smallest durable target, and define a regression check. If the evidence supports only one transient case, return `no candidate`.
6. Generate a review artifact with `node <skill-root>/scripts/propose-skill-evolution.js <session-file> --target-skill-dir <target> --output-dir <review-dir>`. A generic JSON audit may be supplied with `--baseline-report <file>`; it is optional.
7. Validate both this package and the proposal with `node <skill-root>/scripts/validate-skill-package.js <skill-root> --proposal <proposal.json>`.
8. Return the proposal or `no candidate`. Name the evidence, target surface, alternatives considered, smallest recommended change, regression check, maturity impact, risk, and missing evidence.

## Output

Return exactly one disposition:

- `no candidate`: state why the evidence does not justify a reusable change and what additional observation would change that decision.
- `proposal`: provide the generated artifact path plus a concise evidence-to-change summary. Keep `approval.required` true and `apply_plan` null.

The proposal must compare at least two options when a change is warranted: the smallest viable candidate and either a safer alternative or an observe-more-evidence alternative. It may recommend one option, but it must not apply it.

## Evidence rules

- Treat direct user correction and reproduced failure as stronger than keyword counts or model inference.
- Preserve exact excerpts only when needed; redact credentials and user-specific absolute paths.
- Do not convert a single exception, run date, project path, account, or transient count into a general Skill rule.
- Pair every intended change with the evidence it addresses and a check that would catch the same failure again.
- Synthetic fixtures prove proposal structure and regression coverage only. They do not prove improved business results.

## Maturity impact

Classify the target using the local contract:

- `scaffold`: early structure with limited evidence;
- `production`: repeatable workflow with balanced routing and functional checks;
- `library`: portable package with explicit exclusions and distribution-safe metadata;
- `governed`: library-quality package plus ownership, approval, rollback, and public-claim controls.

Report `no maturity impact`, `retain <mode>`, `propose promotion to <mode>`, `observe more evidence`, or `no-skill`. This classification is advice, not a permission grant or registry mutation.

## Boundaries

- Do not edit the target package or invoke another Skill to edit it.
- Do not treat an audit score, route fixture, or heuristic signal as authority to change files.
- Do not publish, push, open a pull request, install a Skill, or change hooks without separate authorization.
- Do not overwrite dirty work or infer approval from the existence of a proposal.
- Do not require SkillQC, Agent Skill Creator, a platform-managed Skill Creator, or private user configuration. Their outputs may be supplied as optional evidence only.

## Resources

- [Evolution quality contract](references/skill-quality-contract.md): invariant IDs, proposal schema, maturity, evidence, portability, and approval rules.
- [Evolution loop](references/evolution-loop.md): candidate comparison, feedback-to-eval conversion, and review cadence.
- [Agent compatibility](references/agent-compatibility.md): optional transcript and hook adapters for different runtimes.
- [Automation playbook](references/automation-playbook.md): proposal-only hook and scheduled-review patterns.
- [Harness patterns](references/harness-patterns.md): trace, eval, loop, and approval patterns.
- `scripts/extract-session.js`: normalize transcript evidence.
- `scripts/propose-skill-evolution.js`: write proposal-only JSON and Markdown artifacts.
- `scripts/validate-skill-package.js`: validate this standalone package and proposal schema.
