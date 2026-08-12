# Agent brief

## Project snapshot

- Last reviewed: 2026-08-12
- Project root: `<PROJECT_ROOT>`
- Project: `skill-evolution`
- Purpose: convert repeated agent behavior and user feedback into reviewable, proposal-only Skill or harness improvements.
- Stack: Node.js standard library, Markdown, JSON, YAML metadata, and `node:test`.
- Canonical package manager: none; Node.js standard library only.
- Production/live-data sensitivity: no live writes. Session exports and proposal excerpts may contain private paths, operational details, or credentials and must be redacted.
- Public source: `https://github.com/rwang23/skill-evolution`.

## Current contract

- Workflow authority: [`SKILL.md`](../SKILL.md).
- Evidence and proposal authority: [`references/skill-quality-contract.md`](../references/skill-quality-contract.md).
- Proposal artifacts remain read-only with `approval.required: true`, `approval.status: "pending"`, and `apply_plan: null`.
- The package runs without SkillQC, Agent Skill Creator, platform-managed Skill Creator, or private user configuration.
- Signal scoring organizes evidence. It does not prove generalization or grant apply authority.

## Read first

1. [`README.md`](../README.md)
2. [`SKILL.md`](../SKILL.md)
3. [`references/skill-quality-contract.md`](../references/skill-quality-contract.md)

## Verification bundle

```powershell
node --test tests/*.test.js
node scripts/validate-skill-package.js .
```

## Tooling map

- Transcript normalizer: `scripts/extract-session.js`
- Proposal generator: `scripts/propose-skill-evolution.js`
- Package and proposal validator: `scripts/validate-skill-package.js`
- Behavior tests: `tests/skill-evolution.test.js`
- Route fixtures: `evals/evals.json`
- Active mirror sync: `tools/Sync-ActiveSkill.ps1`

## Change boundaries

- Keep Skill Evolution proposal-only. Editing or publishing a target requires a separate authorized workflow.
- Keep runtime code on Node.js standard-library modules.
- Do not require another Skill in executable instructions, imports, or routing fixtures.
- Add a focused test when the proposal schema, scoring, redaction, or validator behavior changes.
- Preserve schema and finding-code compatibility or document a migration.
- Do not present synthetic fixtures as proof that a later applied change improves real outcomes.
