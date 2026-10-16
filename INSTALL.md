# Install Skill Evolution

Choose your agent below. Use the existing installation when one is already present; do not create a second active copy with the same name.

## For an agent doing the installation

The user's install request authorizes installing this package in the requested local scope. It does not authorize enabling hooks, uploading private transcripts, changing accounts, publishing, or applying future evolution proposals.

1. Read the user's project instructions and identify the agent and requested scope. Default to a personal installation only when no project scope was requested.
2. Inspect the target and any symlink/junction before writing. If an existing install is found, report its resolved location and preserve local edits. A clean clone of this repository can be updated with a fast-forward; a shared configuration mirror must be updated through its owner instead.
3. Check that Git and Node.js 18+ are available. Clone the public repository only into a new target, or use the ZIP route below. Do not overwrite an unrelated directory or install a different runtime without approval.
4. Resolve `<skill-root>` to the directory containing `SKILL.md`. Confirm its frontmatter name is `skill-evolution`. Run `node "<skill-root>/scripts/validate-skill-package.js" "<skill-root>"` from outside that directory as well as checking the files exist.
5. Run the bundled example into a temporary review directory with `node "<skill-root>/scripts/propose-skill-evolution.js" "<skill-root>/examples/repeated-feedback.jsonl" --output-dir "<temporary-review-dir>"`. Verify that JSON and Markdown were created, approval is pending, and `apply_plan` is null. Validate the JSON with the bundled validator.
6. Report the resolved installation path, checks run, and the invocation syntax below. Ask the user to start a fresh agent session if the skill is not visible yet. Do not claim that a hosted upload or real-client invocation succeeded unless you observed it.

## Claude Code

Personal installation, available across your local projects:

```sh
git clone https://github.com/rwang23/skill-evolution.git "$HOME/.claude/skills/skill-evolution"
```

The command works in Bash and PowerShell. For a shared project installation, extract the ZIP's `skill-evolution/` folder into `.claude/skills/`, so the entrypoint is `.claude/skills/skill-evolution/SKILL.md`. Commit that runtime folder with the project if desired. Keep the directory name unchanged.

Start a fresh Claude Code session, check `/skills`, then try:

```text
/skill-evolution
Try the bundled repeated-feedback example. Explain the evidence, compare the
smallest improvement with a regression-first option, and keep every change
pending my review.
```

Claude Code supports skill directories and symlinked folders under its personal and project skill locations. [Official installation and invocation guide](https://code.claude.com/docs/en/skills).

## Claude web and Cowork

1. Download [skill-evolution.zip](https://raw.githubusercontent.com/rwang23/skill-evolution/main/skill-evolution.zip). Use this file rather than GitHub's full-repository ZIP.
2. Enable code execution and file creation, then open **Customize → Skills → + → Create skill → Upload a skill**. Account and organization policies may affect availability.
3. Upload the ZIP and enable the skill. The archive contains one `skill-evolution/` folder with `SKILL.md`, the Node scripts, supporting references, and an example; it excludes repository history, tests, and promotional media.
4. Ask Claude to use Skill Evolution on the bundled example first. Check that Node.js 18+ is available in the execution environment before running its scripts.

The ZIP's structure and extracted runtime are tested locally. Upload acceptance and script execution in your account depend on that environment and are not implied by a local package check. [Official custom-skill instructions](https://support.claude.com/en/articles/12512180-use-skills-in-claude).

## Codex

For a fresh personal setup:

```sh
git clone https://github.com/rwang23/skill-evolution.git "$HOME/.agents/skills/skill-evolution"
```

For a project-only installation, run this from that project's root:

```sh
git clone https://github.com/rwang23/skill-evolution.git ".agents/skills/skill-evolution"
```

Codex loads personal skills from `$HOME/.agents/skills` and project skills from `.agents/skills/`. Existing grouped or managed layouts take precedence: reuse an installation your Codex setup already discovers rather than cloning a duplicate. [Official OpenAI skill guide](https://learn.chatgpt.com/docs/build-skills).

Invoke with `$skill-evolution`, then provide a chosen transcript or ask for the bundled example. `agents/openai.yaml` supplies optional Codex interface metadata; Claude uses the same root `SKILL.md` without needing that metadata.

Codex detects newly installed skills automatically. If the skill does not appear, restart Codex.

## Your first real review

Share only the relevant transcript or an explicitly selected export. For Claude Code JSONL exports, use `--agent claude`; for Codex JSONL, the extractor can detect the record format. Do not send private history automatically.

Ask for the recurring problem, exact evidence, smallest reusable target, alternatives, and one regression check. If the lesson is a one-off or too weakly supported, `no candidate` is a useful result.

The scripts need Node.js 18+ and no third-party npm packages or extra API key. Your agent provider's normal access and usage requirements still apply.

## Update or remove

For a clean Git clone, confirm the Git root is the resolved skill directory and `origin` is this repository before updating it. A symlink, junction, ZIP install, or directory inside a larger configuration repository needs its own update method; never pull its parent repository by mistake. Preserve edited files and review differences first.

To remove an installation, remove only the identified skill directory or its link after checking what it points to. Removing a link must not remove its shared target.
