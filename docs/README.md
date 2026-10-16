# Documentation index

- [Agent brief](agent-brief.md): project contract, verification, and change boundaries.
- [Document structure baseline](document-structure-baseline.json): provisional documentation governance record.
- [Changelog](CHANGELOG.md): repository-level changes.
- [Evolution quality contract](../references/skill-quality-contract.md): runtime invariant and proposal-schema authority.
- [Evolution loop](../references/evolution-loop.md): candidate and review patterns.
- [Installation](../INSTALL.md): human and agent setup for Claude Code, Claude web/Cowork, and Codex.
- [Claude upload ZIP](../skill-evolution.zip): generated runtime distribution; rebuild with [the packager](../tools/package_skill.py), then run its `--check` and the install tests.
- [First-run example](../examples/repeated-feedback.jsonl): synthetic feedback for trying the workflow without private history.

README media lives in `assets/`; its reproducible motion source and [rebuild instructions](../tools/readme-demo/README.md) live in `tools/readme-demo/`. The [overview illustration prompt](../tools/readme-overview-prompt.md) records the separate imagegen artwork. These files explain the workflow and do not establish task effectiveness. Rebuild the upload ZIP after a runtime change; keep development files and promotional media out of it.

The root [README](../README.md) is the English user guide. [README.zh-CN](../README.zh-CN.md) is the Chinese user guide. `SKILL.md` remains the executable workflow authority.
