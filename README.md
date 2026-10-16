# Skill Evolution

Skill Evolution turns repeated agent behavior, user corrections, routing misses, and failed verification into reviewable Skill or harness improvement proposals. It collects evidence and compares options. It never applies the change.

[中文说明](README.zh-CN.md)

## What it owns

Use this Skill when a reusable behavior may need to change and the evidence must be traced before anyone edits the package. The output is either `no candidate` or a proposal with evidence, alternatives, validation, maturity impact, risk, and pending approval.

Skill Evolution does not create a new Skill package, score a Skill numerically, edit an accepted candidate, install anything, or write to Git. Those are separate actions with separate authority.

## Standalone by design

The package needs Node.js 18 or later and uses only Node.js standard-library modules. Its evolution contract, transcript extractor, proposal generator, validator, route fixtures, and tests all live in this repository.

```text
Skill Evolution
├── SKILL.md
├── references/skill-quality-contract.md
├── scripts/extract-session.js
├── scripts/propose-skill-evolution.js
├── scripts/validate-skill-package.js
└── evals/evals.json
```

It does not call SkillQC, Agent Skill Creator, a platform-managed Skill Creator, or private local configuration. You may provide an audit report or other evidence, but that input is optional and does not grant permission to apply a change.

## Install for an agent

Clone the repository into a directory that your agent discovers as a Skill:

```powershell
git clone https://github.com/rwang23/skill-evolution.git `
  "$env:USERPROFILE\.codex\skills\skill-evolution"
```

For another Agent Skills runtime, copy the same `skill-evolution` folder into that runtime's Skill directory. Keep the folder name unchanged so it matches the frontmatter name.

Then ask the agent directly:

```text
Use $skill-evolution to review the repeated routing failures from this milestone.
Compare the smallest contract change with a regression-first option.
Return a proposal only. Do not modify files.
```

## Proposal workflow

Normalize an exported session when you need a focused evidence view:

```powershell
node scripts/extract-session.js C:\path\to\session.jsonl `
  --format json `
  --include-tool-output `
  --query routing
```

Generate the review artifacts:

```powershell
node scripts/propose-skill-evolution.js C:\path\to\session.jsonl `
  --target-skill-dir C:\path\to\target-skill `
  --output-dir C:\path\to\review
```

The generator writes JSON and Markdown. Its deterministic signal score organizes evidence, but it does not establish that a lesson generalizes. A reviewer still checks the cited excerpts and target context.

Pass an explicit transcript file or `--session-dir`. Codex JSONL exports are detected from their records, including exports outside the Codex home folder. Known injected instruction wrappers are excluded and paired event/response mirrors are counted once. `--session-dir --cwd <project>` fails if no session matches that project.

The extractor rejects inputs above 32 MiB and reports source lines, malformed records, excluded context, query filtering, and truncation. Create a smaller scoped export for a larger session. Extractor output is raw private evidence; generated proposal excerpts are redacted before truncation. Keyword mentions, assistant assertions, and isolated errors produce no candidate without corroborated user feedback. The screening remains heuristic and generalization remains unreviewed.

An external JSON audit can be attached as optional evidence:

```powershell
node scripts/propose-skill-evolution.js C:\path\to\session.jsonl `
  --target-skill-dir C:\path\to\target-skill `
  --baseline-report C:\path\to\audit.json `
  --output-dir C:\path\to\review
```

## Proposal boundary

Every version 2 artifact contains:

- `status: "proposal"` or `"no-candidate"`;
- `mode: "proposal-only"`;
- redacted evidence and a signal assessment;
- target and maturity-impact fields;
- at least two candidates when a proposal is warranted;
- validation expectations;
- `approval.required: true`, `approval.status: "pending"`, and `apply_plan: null`.

The default recommendation is regression-first because it makes the observed miss reproducible before a broader behavior change. A human or separately authorized workflow may choose another candidate after reviewing the source evidence.

For material changes, compare baseline and candidate on the same task, retain a held-out case, and distinguish task quality, triggering, instruction compliance, and cost. Include a no-Skill control when claiming capability uplift. An optional SkillQC score measures package quality; it cannot prove task improvement. See [the comparison protocol](references/evolution-loop.md#comparison-before-recommendation).

Existing version 2 artifacts remain readable. New coverage and provenance fields are additive; validation now rejects empty or duplicate evidence/candidate IDs and recommendations that do not name a candidate. Older wrappers that relied on implicit home-directory discovery must pass a session path or directory explicitly.

## Validate

Validate the package by itself:

```powershell
node scripts/validate-skill-package.js .
```

Validate a generated proposal against the same local contract:

```powershell
node scripts/validate-skill-package.js . `
  --proposal C:\path\to\review\proposal.json `
  --json
```

The validator checks routing metadata, proposal-only boundaries, local links, eval balance, sibling-Skill independence, private paths, credential-shaped strings, script syntax, and proposal schema.

## Development

Run the focused checks from the repository root:

```powershell
node --test tests/*.test.js
node scripts/validate-skill-package.js .
```

CI runs the same checks on Windows and Linux. Synthetic transcripts prove package behavior and regression coverage only. They do not prove that a future applied change improves business outcomes.

## License

MIT. See [LICENSE](LICENSE).
