# Changelog

## 1.5.0 - 2026-11-01

- The analyzer now recognises corrections phrased as "you put/wrote/added ... again" and rule restatements after "again"; a five-correction session that scored 0 now produces a proposal with a hard-check candidate.
- The description again says "whether an incident should become a Skill rule" (dropping "Skill" coincided with a routing regression), and all artifacts must stay inside the output directory the user named.
- Recorded a two-model client run (Claude Sonnet 5.5 and Codex gpt-6.1-terra) graded by an independent judge; its outcomes are the baseline in `evals/history.jsonl`.

## 1.4.0 - 2026-11-01

- Candidates carry a `constraint_layer` (`structure`, `deterministic-check`, `eval`, `instruction`); recurring corrections add a `hard-check` candidate that turns the invariant into a failing check. The validator rejects unknown layers (`SE-C2`).
- The proposer reads tool calls for heuristic failure modes (`edit-without-read`, `claim-before-investigation`, `unverified-completion`) and reports them as supporting `trace-signal` evidence that never makes evidence strong.
- `eval_plan.run_protocol` states how drafts are run: isolated, blind, independently judged, on more than one model, and re-run after every edit.
- Documented the constraint ladder and tool-trace review in `references/evolution-loop.md`; the self-eval suite now has 16 cases.
- From a blind client eval pilot with an independent judge: the description now covers deciding whether an incident should become a Skill rule (a routing miss), and a pressure rule keeps runs proposal-only instead of offering a direct edit. A pressure case that both defensible behaviors failed was revised as `pressure-claimed-approval-direct-edit`.

## 1.3.0 - 2026-10-31

- Proposal schema 3: every proposal carries an `eval_plan` with draft held-out cases from user corrections and a summary of the target suite's missing case types; the validator enforces it (`SE-EV1`) for schema 3 only.
- Added `scripts/skill-usage-report.js`, which counts Skill tool calls, `SKILL.md` reads, and path mentions across explicit session directories and lists installed Skills never observed, as a labelled lower bound.
- Proposals now record `target.canonical_dir` and `target.is_link_view`, so an edit lands at the canonical owner rather than a link view or copy.
- Expanded the self-eval suite to 14 specified cases covering usage evidence, eval plans, near-neighbor audits, and pressure.

## 2026-10-16

- Redesigned the README animation and workflow still with a light editorial palette, clearer typography, and more whitespace.
- Added an overview illustration with layered paper and placed it at the top of the guide; kept the animated workflow next to the explanation.

## 2026-10-15

- Reworked English and Chinese READMEs around user outcomes, first-use examples, Claude installation, and agent-assisted setup; moved technical detail into installation and development references.
- Added an eight-second illustrative GIF, a still image, and reproducible local animation sources for the README.
- Added a deterministic runtime-only Claude upload ZIP and fresh-install tests for personal/project folders, spaces in paths, and running from another working directory.
- Preserve Claude Code tool-use/result blocks, explicit tool error flags, and metadata boundaries when normalizing its transcripts.
- Detect Codex exports without a forced generic parser, retain source-line pointers, exclude known injected context, and deduplicate paired event/response messages.
- Require explicit transcript scope, reject mismatched project selection and inputs above 32 MiB, and disclose parsing/filtering/truncation coverage.
- Require corroborated user feedback for heuristic proposal screening; redact before excerpt truncation and target-name inference.
- Enforce non-empty evidence references, unique IDs, valid recommendations, maturity impact, and validation in version 2 artifacts.
- Stop validation before scanning non-package directories; handle help and unknown options without falling through to a workspace audit.
- Add regression coverage and a baseline/candidate comparison protocol informed by current primary sources. Keep proposal-only authority and standard-library dependencies unchanged.

## 2026-08-12

- Made the package independently runnable with no required sibling Skill or private user configuration.
- Added a local evolution quality contract with evidence, generalization, candidate, validation, approval, portability, and maturity invariants.
- Added version 2 proposal-only artifacts, optional generic audit evidence, explicit approval fields, and a null apply plan.
- Expanded validation, route fixtures, redaction coverage, tests, CI, bilingual documentation, and active-mirror sync tooling.
