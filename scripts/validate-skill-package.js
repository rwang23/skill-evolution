#!/usr/bin/env node

/** Validate the standalone Skill Evolution package and optional proposal. */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let skillDir = process.cwd();
let proposalPath = null;
let stdoutJson = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--proposal' && args[index + 1]) {
    proposalPath = path.resolve(args[++index]);
  } else if (arg === '--json' || arg === '--stdout-json') {
    stdoutJson = true;
  } else if (!arg.startsWith('-')) {
    skillDir = path.resolve(arg);
  }
}

const findings = [];

function add(code, severity, message, filePath) {
  findings.push({
    code,
    severity,
    message,
    path: path.relative(skillDir, filePath || skillDir).replace(/\\/g, '/') || '.',
  });
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, output);
    else output.push(fullPath);
  }
  return output;
}

function parseFrontmatter(content, filePath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    add('SE-P1', 'error', 'SKILL.md must start with YAML frontmatter.', filePath);
    return null;
  }
  const values = {};
  const keys = [];
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    keys.push(field[1]);
    values[field[1]] = field[2].replace(/^(["'])(.*)\1$/, '$2').trim();
  }
  return { values, keys, body: content.slice(match[0].length) };
}

function validateSkillMd() {
  const filePath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(filePath)) {
    add('SE-P1', 'error', 'Missing root SKILL.md.', filePath);
    return;
  }
  const content = read(filePath);
  const parsed = parseFrontmatter(content, filePath);
  if (!parsed) return;
  const allowedKeys = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata']);
  const unexpected = parsed.keys.filter((key) => !allowedKeys.has(key));
  if (unexpected.length) add('SE-P1', 'error', `Unexpected frontmatter keys: ${unexpected.join(', ')}`, filePath);
  const name = parsed.values.name || '';
  const description = parsed.values.description || '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    add('SE-P1', 'error', 'Frontmatter name must be lowercase hyphen-case and at most 64 characters.', filePath);
  }
  if (name && path.basename(skillDir) !== name) {
    add('SE-P1', 'error', `Folder name does not match frontmatter name '${name}'.`, filePath);
  }
  if (!description || description.length > 250) {
    add('SE-P1', 'error', 'Description must be present and at most 250 characters.', filePath);
  }
  if (!/\buse\s+(?:when|for)\b|适用于|用于|当.+时/i.test(description)) {
    add('SE-P1', 'error', 'Description must state a concrete trigger.', filePath);
  }
  if (!/\bnot\s+for\b|不适用|不负责/i.test(description)) {
    add('SE-P1', 'warning', 'Description should name an exclusion or near-neighbor boundary.', filePath);
  }
  if (/^#\s+Skill Evolution\s*$/im.test(parsed.body)) {
    add('SE-P1', 'error', 'Active body repeats the Skill name as a first-level heading.', filePath);
  }
  if ((parsed.body.match(/\r?\n/g) || []).length > 500) {
    add('SE-P1', 'error', 'SKILL.md body exceeds 500 lines.', filePath);
  }
  for (const [label, pattern] of [
    ['workflow', /^##\s+(?:Workflow|Process|流程)/im],
    ['output', /^##\s+(?:Output|Result|输出|交付)/im],
    ['boundaries', /^##\s+(?:Boundaries|Guardrails|边界)/im],
  ]) {
    if (!pattern.test(parsed.body)) add('SE-P1', 'error', `SKILL.md is missing a dedicated ${label} section.`, filePath);
  }
  if (!/proposal-only/i.test(parsed.body) || !/apply_plan/i.test(parsed.body)) {
    add('SE-A1', 'error', 'SKILL.md must state the proposal-only and null apply-plan boundary.', filePath);
  }
}

function validateLinks() {
  const markdownFiles = [path.join(skillDir, 'SKILL.md'), ...walk(path.join(skillDir, 'references')).filter((file) => file.endsWith('.md'))];
  const linkPattern = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
  for (const filePath of markdownFiles) {
    if (!fs.existsSync(filePath)) continue;
    const content = read(filePath);
    let match;
    while ((match = linkPattern.exec(content)) !== null) {
      const raw = match[1].trim();
      const target = raw.split('#', 1)[0];
      if (!target || /^(?:https?:|mailto:|#)/i.test(raw)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(filePath), target))) {
        add('SE-P1', 'error', `Broken local link: ${raw}`, filePath);
      }
    }
  }
}

function validateRuntimeText() {
  const files = walk(skillDir).filter((file) => /\.(?:md|js|json|yaml|yml|txt)$/i.test(file));
  const secrets = [
    /\bsk-[a-z0-9_-]{16,}\b/i,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];
  const privatePaths = [/C:\\Users\\[^\\\s"`]+/i, /\/(?:Users|home)\/[^/\s"`]+/];
  for (const filePath of files) {
    const content = read(filePath);
    if (secrets.some((pattern) => pattern.test(content))) {
      add('SE-P1', 'error', 'Credential-shaped literal found; matched value suppressed.', filePath);
    }
    for (const pattern of privatePaths) {
      const match = content.match(pattern);
      if (match && !/[<$%]/.test(match[0])) {
        add('SE-P1', 'error', 'Private user path found in a shareable package.', filePath);
        break;
      }
    }
  }
}

function validateInterface() {
  const filePath = path.join(skillDir, 'agents', 'openai.yaml');
  if (!fs.existsSync(filePath)) {
    add('SE-P1', 'error', 'Missing agents/openai.yaml.', filePath);
    return;
  }
  const content = read(filePath);
  for (const field of ['display_name', 'short_description', 'default_prompt']) {
    if (!new RegExp(`^\\s{2}${field}:\\s*\\S`, 'm').test(content)) {
      add('SE-P1', 'error', `Missing interface.${field}.`, filePath);
    }
  }
  if (!content.includes('$skill-evolution')) {
    add('SE-P1', 'error', 'default_prompt must explicitly invoke $skill-evolution.', filePath);
  }
}

function validateEvals() {
  const filePath = path.join(skillDir, 'evals', 'evals.json');
  if (!fs.existsSync(filePath)) {
    add('SE-V1', 'error', 'Missing evals/evals.json.', filePath);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(read(filePath));
  } catch (error) {
    add('SE-V1', 'error', `Invalid eval JSON: ${error.message}`, filePath);
    return;
  }
  if (payload.skill_name !== 'skill-evolution' || !Array.isArray(payload.evals)) {
    add('SE-V1', 'error', 'Eval package must name skill-evolution and contain an evals array.', filePath);
    return;
  }
  const caseTypes = new Set(payload.evals.map((item) => item.routing && item.routing.case_type));
  for (const required of ['positive', 'negative', 'near-neighbor', 'held-out']) {
    if (!caseTypes.has(required)) add('SE-V1', 'error', `Missing ${required} routing case.`, filePath);
  }
  if (!payload.evals.some((item) => item.pressure)) {
    add('SE-V1', 'error', 'At least one pressure case is required.', filePath);
  }
  for (const item of payload.evals) {
    const shouldTrigger = item.routing && Array.isArray(item.routing.should_trigger) ? item.routing.should_trigger : [];
    const requiredSibling = shouldTrigger.filter((name) => name !== 'skill-evolution');
    if (requiredSibling.length) {
      add('SE-P1', 'error', `Eval '${item.id}' requires sibling Skill routing: ${requiredSibling.join(', ')}`, filePath);
    }
  }
  if (/\bTODO\b/i.test(JSON.stringify(payload))) add('SE-V1', 'error', 'Eval package contains TODO placeholders.', filePath);
}

function validateContract() {
  const filePath = path.join(skillDir, 'references', 'skill-quality-contract.md');
  if (!fs.existsSync(filePath)) {
    add('SE-P1', 'error', 'Missing the local evolution quality contract.', filePath);
    return;
  }
  const content = read(filePath);
  for (const code of ['SE-E1', 'SE-G1', 'SE-C1', 'SE-T1', 'SE-V1', 'SE-A1', 'SE-P1', 'SE-M1']) {
    if (!content.includes(code)) add('SE-P1', 'error', `Quality contract is missing invariant ${code}.`, filePath);
  }
}

function validateScripts() {
  for (const filePath of walk(path.join(skillDir, 'scripts')).filter((file) => file.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
    if (result.status !== 0) {
      add('SE-P1', 'error', `JavaScript syntax check failed: ${(result.stderr || result.stdout).trim()}`, filePath);
    }
  }
}

function validateProposal() {
  if (!proposalPath) return;
  let proposal;
  try {
    proposal = JSON.parse(read(proposalPath));
  } catch (error) {
    add('SE-A1', 'error', `Cannot read proposal JSON: ${error.message}`, proposalPath);
    return;
  }
  if (proposal.schema_version !== 2 || proposal.artifact_type !== 'skill-evolution-proposal') {
    add('SE-A1', 'error', 'Proposal must use schema_version 2 and the skill-evolution-proposal artifact type.', proposalPath);
  }
  if (!['proposal', 'no-candidate'].includes(proposal.status)) {
    add('SE-A1', 'error', 'Proposal status must be proposal or no-candidate.', proposalPath);
  }
  if (proposal.mode !== 'proposal-only' || proposal.apply_plan !== null) {
    add('SE-A1', 'error', 'Proposal must be proposal-only with apply_plan set to null.', proposalPath);
  }
  if (proposal.approval?.required !== true || proposal.approval?.status !== 'pending') {
    add('SE-A1', 'error', 'Proposal must require approval with pending status.', proposalPath);
  }
  if (!proposal.signal_assessment || !Array.isArray(proposal.evidence) || !proposal.validation) {
    add('SE-E1', 'error', 'Proposal is missing signal assessment, evidence, or validation.', proposalPath);
  }
  if (proposal.status === 'proposal') {
    if (!Array.isArray(proposal.candidates) || proposal.candidates.length < 2) {
      add('SE-C1', 'error', 'A proposal must compare at least two candidates.', proposalPath);
    }
    if (!proposal.recommended_candidate) {
      add('SE-C1', 'error', 'A proposal must identify a recommended candidate.', proposalPath);
    }
    const evidenceIds = new Set((proposal.evidence || []).map((item) => item.id));
    for (const candidate of proposal.candidates || []) {
      if (!Array.isArray(candidate.evidence_ids) || candidate.evidence_ids.some((id) => !evidenceIds.has(id))) {
        add('SE-E1', 'error', `Candidate '${candidate.id || 'unknown'}' has invalid evidence references.`, proposalPath);
      }
      if (!Array.isArray(candidate.validation) || !candidate.validation.length) {
        add('SE-V1', 'error', `Candidate '${candidate.id || 'unknown'}' lacks validation expectations.`, proposalPath);
      }
    }
  } else if (Array.isArray(proposal.candidates) && proposal.candidates.length) {
    add('SE-G1', 'error', 'A no-candidate artifact must not contain change candidates.', proposalPath);
  }
}

if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) {
  console.error(`Skill directory not found: ${skillDir}`);
  process.exit(1);
}

validateSkillMd();
validateLinks();
validateRuntimeText();
validateInterface();
validateEvals();
validateContract();
validateScripts();
validateProposal();

const errors = findings.filter((item) => item.severity === 'error').length;
const warnings = findings.filter((item) => item.severity === 'warning').length;
const result = {
  schema_version: 1,
  skill: 'skill-evolution',
  status: errors ? 'FAIL' : 'PASS',
  errors,
  warnings,
  proposal: proposalPath ? path.relative(skillDir, proposalPath).replace(/\\/g, '/') : null,
  findings,
};

if (stdoutJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const finding of findings) {
    const stream = finding.severity === 'error' ? console.error : console.warn;
    stream(`[${finding.severity.toUpperCase()}] ${finding.code} ${finding.path}: ${finding.message}`);
  }
  console.log(`${result.status}: skill-evolution (${errors} errors, ${warnings} warnings)`);
}
process.exit(errors ? 1 : 0);
