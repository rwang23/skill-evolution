# Skill Evolution

Skill Evolution 把重复出现的 Agent 行为、用户纠正、路由遗漏和验证失败整理成可审阅的 Skill 或 Agent Harness 改进提案。它负责收集证据和比较方案，不负责应用修改。

[English README](README.md)

## 它负责什么

当某个可复用行为可能需要调整，而且动手前必须还原证据链时，使用本 Skill。结果只有两种：`no candidate`，或一份包含证据、备选方案、验证、成熟度影响、风险和待审批状态的提案。

Skill Evolution 不创建新 Skill 包，不做量化评分，不修改已接受的方案，不安装文件，也不写入 Git。这些动作需要单独的工具和权限。

## 独立运行

运行环境只需要 Node.js 18 或更高版本，全部代码只使用 Node.js 标准库。演化契约、会话提取器、提案生成器、验证器、路由用例和测试都在本仓库内。

```text
Skill Evolution
├── SKILL.md
├── references/skill-quality-contract.md
├── scripts/extract-session.js
├── scripts/propose-skill-evolution.js
├── scripts/validate-skill-package.js
└── evals/evals.json
```

它不调用 SkillQC、Agent Skill Creator、平台管理的 Skill Creator，也不依赖私有本地配置。你可以附加审计报告或其他证据，但这些都是可选输入，不能代替修改授权。

## 安装给 Agent

把仓库克隆到 Agent 能发现的 Skill 目录：

```powershell
git clone https://github.com/rwang23/skill-evolution.git `
  "$env:USERPROFILE\.codex\skills\skill-evolution"
```

其他兼容 Agent Skills 的运行环境也可以直接复制同一个 `skill-evolution` 文件夹。文件夹名称不要改动，它需要和 frontmatter 中的名称一致。

安装后直接告诉 Agent：

```text
请使用 $skill-evolution 复盘这个里程碑中重复出现的路由失败。
比较最小契约修改和先补回归用例两种方案。
只返回提案，不要修改文件。
```

## 生成提案

需要聚焦查看会话证据时，先规范化导出的会话：

```powershell
node scripts/extract-session.js C:\path\to\session.jsonl `
  --format json `
  --include-tool-output `
  --query routing
```

生成 JSON 和 Markdown 审阅文件：

```powershell
node scripts/propose-skill-evolution.js C:\path\to\session.jsonl `
  --target-skill-dir C:\path\to\target-skill `
  --output-dir C:\path\to\review
```

生成器使用确定性信号分数整理证据。这个分数不能证明经验已经具有普适性，审阅者仍需回到原始上下文检查引用和目标文件。

也可以附加一份通用 JSON 审计作为可选证据：

```powershell
node scripts/propose-skill-evolution.js C:\path\to\session.jsonl `
  --target-skill-dir C:\path\to\target-skill `
  --baseline-report C:\path\to\audit.json `
  --output-dir C:\path\to\review
```

## 提案边界

每份 version 2 提案都包含：

- `status: "proposal"` 或 `"no-candidate"`；
- `mode: "proposal-only"`；
- 已脱敏的证据和信号判断；
- 目标文件与成熟度影响；
- 证据足够时至少比较两个候选方案；
- 验证要求；
- `approval.required: true`、`approval.status: "pending"` 和 `apply_plan: null`。

默认推荐先补回归用例，因为它能在扩大修改前复现已经观察到的问题。审阅者或另一个获得明确授权的工作流可以在核对原始证据后选择其他方案。

## 验证

单独验证本 Skill 包：

```powershell
node scripts/validate-skill-package.js .
```

用同一份本地契约验证生成的提案：

```powershell
node scripts/validate-skill-package.js . `
  --proposal C:\path\to\review\proposal.json `
  --json
```

验证范围包括路由元数据、只提案边界、本地链接、用例平衡、兄弟 Skill 独立性、私有路径、疑似凭据、脚本语法和提案结构。

## 开发验证

在仓库根目录运行：

```powershell
node --test tests/*.test.js
node scripts/validate-skill-package.js .
```

CI 会在 Windows 和 Linux 上运行相同检查。合成会话只能证明包行为和回归覆盖，不能证明未来应用某个修改后一定能改善业务结果。

## 许可

MIT，详见 [LICENSE](LICENSE)。
