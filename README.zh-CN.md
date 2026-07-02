# Skill Evolution

这是一个用于 Codex、Claude Code、Hermes、Antigravity、OpenAI Agent Skills 以及兼容 Agent Skills 标准的智能体的 skill / harness 自我进化工具。

GitHub 仓库：https://github.com/rwang23/skill-evolution

它的目标不是让 agent 无限制地自动修改自己，而是把真实工作中的会话、用户反馈、失败记录、工具输出、报告、trace、eval、hook 事件和外部调研，转化成可审查、可验证、可回滚的 skill / harness 优化。

## 它解决什么问题

- 不只读取最终总结报告，而是回读完整 session 和对话过程。
- 从人类反馈、反复失败、成功修复中提炼可复用的规则。
- 判断应该修改 `SKILL.md`、reference、script，还是补 eval/checker。
- 支持标准 Agent Skills 文件夹结构：`SKILL.md`、`scripts/`、`references/`。
- 给出安全的 hook 方案：先捕获证据，再生成优化提案，最后经确认后应用。
- 自带可配置的 session 提取脚本，支持 Codex、Claude 风格 JSONL、通用 JSONL/JSON、Markdown 和纯文本 transcript。
- 增加可运行的 proposal 生成器和公开包验证器，支持 PR-gated skill evolution。

## 安装

先克隆公开仓库：

```bash
git clone https://github.com/rwang23/skill-evolution.git
```

macOS/Linux：

```bash
mkdir -p ~/.codex/skills ~/.claude/skills ~/.hermes/skills
cp -R skill-evolution ~/.codex/skills/
cp -R skill-evolution ~/.claude/skills/
cp -R skill-evolution ~/.hermes/skills/
```

Windows PowerShell：

```powershell
git clone https://github.com/rwang23/skill-evolution.git

# Codex
Copy-Item -Recurse .\skill-evolution "$env:USERPROFILE\.codex\skills\"

# Claude Code，如果你的 Claude Code 配置会读取这个目录
Copy-Item -Recurse .\skill-evolution "$env:USERPROFILE\.claude\skills\"

# Hermes
Copy-Item -Recurse .\skill-evolution "$env:USERPROFILE\.hermes\skills\"
```

其他兼容 Agent Skills 的工具，把克隆得到的 `skill-evolution` 文件夹放到对应的 skill 扫描目录即可。如果目标目录已经存在旧版本，先备份或检查本地修改，不要盲目覆盖。

## 让 Agent 自动安装

可以把下面这段直接复制给有 shell 和 Git 权限的 agent：

```text
Install the public Agent Skill repository https://github.com/rwang23/skill-evolution into my local agent skills directory.

Requirements:
- Clone `https://github.com/rwang23/skill-evolution.git` into any workspace or downloads directory you normally use.
- Copy the `skill-evolution` folder into the skills directory for my active agent:
  - Codex: `$CODEX_HOME/skills` or `$HOME/.codex/skills`
  - Claude Code: `$HOME/.claude/skills`
  - Hermes: `$HOME/.hermes/skills`
  - Windows equivalents should use `%USERPROFILE%` or `$env:USERPROFILE`.
- Run `node scripts/validate-skill-package.js <installed-skill-dir>`.
- If Codex's skill-creator validator exists locally, also run `quick_validate.py`.
- Do not overwrite a dirty existing copy. Back it up or ask first.
- Report the installed path and validation output.
```

## 使用方式

可以显式让 agent 调用：

```text
Use $skill-evolution to review recent sessions, convert recurring feedback into evals, and propose safe skill or harness improvements.
```

也可以直接运行 transcript 提取脚本：

```bash
node ./scripts/extract-session.js --agent codex --cwd "$PWD" --max-messages 120 --include-tool-output
node ./scripts/extract-session.js --session-dir ~/path/to/sessions --query "user correction" --format json
```

## 安全模型

推荐的闭环是：

1. 捕获证据。
2. 生成带引用的 diff 提案。
3. 验证修改后的 skill。
4. 经人工确认或可信本地流程后，再本地应用或打开 draft PR。

自动 hook 通常只应该写入优化提案，不应该静默修改 skill。

## Hook 或定期审查

可以在长任务结束后、Claude Code hook、Codex wrapper、cron/systemd 或 CI 中运行：

```bash
node ./scripts/propose-skill-evolution.js \
  --agent codex \
  --cwd "$PWD" \
  --skill-dir .
```

默认输出到 `~/.agent-skill-evolution/proposals/`，也可以用 `--output-dir` 指定。

## Hook 安装方式

Claude Code：

```bash
node "$HOME/.codex/skills/skill-evolution/scripts/propose-skill-evolution.js" \
  --agent claude \
  --session-dir "$HOME/.claude/projects" \
  --cwd "$PWD" \
  --skill-dir "$HOME/.codex/skills/skill-evolution"
```

Linux cron 或 systemd timer：

```bash
SKILL_DIR="$HOME/.codex/skills/skill-evolution"
node "$SKILL_DIR/scripts/propose-skill-evolution.js" \
  --agent codex \
  --session-dir "$HOME/.codex/sessions" \
  --skill-dir "$SKILL_DIR"
```

Windows PowerShell 计划任务命令：

```powershell
$SkillDir = "$env:USERPROFILE\.codex\skills\skill-evolution"
node "$SkillDir\scripts\propose-skill-evolution.js" `
  --agent codex `
  --session-dir "$env:USERPROFILE\.codex\sessions" `
  --skill-dir "$SkillDir"
```

## 验证

```bash
node ~/.codex/skills/skill-evolution/scripts/validate-skill-package.js ~/.codex/skills/skill-evolution
python ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py ~/.codex/skills/skill-evolution
```

## 许可

MIT
