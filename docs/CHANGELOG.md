# Changelog

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
