#!/usr/bin/env node

/**
 * Generate a reviewable skill-evolution proposal from a session transcript.
 *
 * This script does not edit skills. It captures signals and writes proposal
 * artifacts that a human or trusted agent can review.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let sessionPath = null;
let sessionDir = null;
let agent = 'generic';
let cwd = process.cwd();
let skillDir = null;
let outputDir = path.join(os.homedir(), '.agent-skill-evolution', 'proposals');
let minToolCalls = 5;
let query = null;
let includeSystem = false;
let redactPaths = true;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--agent' && args[i + 1]) {
    agent = args[++i];
  } else if (arg === '--cwd' && args[i + 1]) {
    cwd = args[++i];
  } else if (arg === '--session-dir' && args[i + 1]) {
    sessionDir = args[++i];
  } else if (arg === '--skill-dir' && args[i + 1]) {
    skillDir = args[++i];
  } else if (arg === '--output-dir' && args[i + 1]) {
    outputDir = args[++i];
  } else if (arg === '--min-tool-calls' && args[i + 1]) {
    minToolCalls = Number.parseInt(args[++i], 10);
  } else if (arg === '--query' && args[i + 1]) {
    query = args[++i];
  } else if (arg === '--include-system') {
    includeSystem = true;
  } else if (arg === '--no-redact-paths') {
    redactPaths = false;
  } else if (!arg.startsWith('-')) {
    sessionPath = arg;
  }
}

function die(message) {
  console.error(message);
  process.exit(1);
}

function skillRoot() {
  if (skillDir) return path.resolve(skillDir);
  return path.resolve(__dirname, '..');
}

function runExtractor() {
  const extractor = path.join(skillRoot(), 'scripts', 'extract-session.js');
  if (!fs.existsSync(extractor)) die(`Missing extractor: ${extractor}`);

  const commandArgs = [extractor, '--agent', agent, '--cwd', cwd, '--format', 'json', '--include-tool-output', '--max-messages', '500'];
  if (sessionPath) commandArgs.splice(1, 0, sessionPath);
  if (sessionDir) commandArgs.push('--session-dir', sessionDir);
  if (query) commandArgs.push('--query', query);

  const result = spawnSync(process.execPath, commandArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    die(`Extractor failed:\n${result.stderr || result.stdout}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    die(`Extractor did not return JSON: ${error.message}`);
  }
}

function scoreMessages(messages) {
  const correctionPatterns = [
    /not enough/i,
    /you missed/i,
    /should have/i,
    /wrong/i,
    /不够/,
    /没有/,
    /不是/,
    /应该/,
    /问题/,
    /纠正/,
    /不对/,
  ];
  const errorPatterns = [
    /error/i,
    /failed/i,
    /exception/i,
    /traceback/i,
    /denied/i,
    /失败/,
    /报错/,
    /错误/,
  ];
  const workflowPatterns = [
    /repeat/i,
    /workflow/i,
    /hook/i,
    /skill/i,
    /session/i,
    /evolution/i,
    /self-improv/i,
    /流程/,
    /复用/,
    /自我/,
    /优化/,
    /进化/,
  ];

  const counts = {
    toolCalls: 0,
    toolOutputs: 0,
    userCorrections: 0,
    errorSignals: 0,
    workflowSignals: 0,
  };
  const evidence = [];

  for (const msg of messages) {
    if (!includeSystem && ['system', 'developer'].includes(msg.role)) continue;
    const text = msg.content || '';
    if (msg.role === 'tool_call' || /tool_call/i.test(msg.kind || '')) counts.toolCalls++;
    if (msg.role === 'tool_output' || /tool_output/i.test(msg.kind || '')) counts.toolOutputs++;

    const matchedCorrection = msg.role === 'user' && correctionPatterns.some((pattern) => pattern.test(text));
    const matchedError = errorPatterns.some((pattern) => pattern.test(text));
    const matchedWorkflow = workflowPatterns.some((pattern) => pattern.test(text));

    if (matchedCorrection) {
      counts.userCorrections++;
      evidence.push({ type: 'user-correction', role: msg.role, timestamp: msg.timestamp, excerpt: redact(text.slice(0, 500)) });
    }
    if (matchedError) {
      counts.errorSignals++;
      if (evidence.length < 12) evidence.push({ type: 'error-signal', role: msg.role, timestamp: msg.timestamp, excerpt: redact(text.slice(0, 500)) });
    }
    if (matchedWorkflow) {
      counts.workflowSignals++;
      if (evidence.length < 12) evidence.push({ type: 'workflow-signal', role: msg.role, timestamp: msg.timestamp, excerpt: redact(text.slice(0, 500)) });
    }
  }

  let score = 0;
  if (counts.toolCalls >= minToolCalls) score += 2;
  score += Math.min(counts.userCorrections * 3, 9);
  score += Math.min(counts.errorSignals, 4);
  score += Math.min(counts.workflowSignals, 4);

  const triggers = [];
  if (counts.toolCalls >= minToolCalls) triggers.push(`complex task: ${counts.toolCalls} tool calls`);
  if (counts.userCorrections) triggers.push(`user corrections: ${counts.userCorrections}`);
  if (counts.errorSignals) triggers.push(`error/dead-end signals: ${counts.errorSignals}`);
  if (counts.workflowSignals) triggers.push(`workflow/skill signals: ${counts.workflowSignals}`);

  return { counts, score, triggers, evidence: evidence.slice(0, 12) };
}

function inferTargets(messages, configuredSkillDir) {
  const targets = new Set();
  if (configuredSkillDir) targets.add(redact(path.resolve(configuredSkillDir)));

  for (const msg of messages) {
    const text = msg.content || '';
    const skillMentions = text.match(/\b[a-z0-9][a-z0-9-]{2,63}\b/g) || [];
    for (const item of skillMentions) {
      if (item.includes('skill') || item.includes('optimize') || item.includes('update')) {
        targets.add(item);
      }
    }
  }
  return Array.from(targets).slice(0, 8);
}

function redact(value) {
  const text = String(value || '');
  if (!redactPaths) return text;
  const home = os.homedir();
  let output = text;
  if (home) {
    output = output.split(home).join('$HOME');
    output = output.split(home.replace(/\\/g, '/')).join('$HOME');
  }
  const normalizedCwd = path.resolve(cwd);
  if (normalizedCwd) {
    output = output.split(normalizedCwd).join('$PWD');
    output = output.split(normalizedCwd.replace(/\\/g, '/')).join('$PWD');
  }
  output = output.replace(/C:\\\\Users\\\\[^\\\\\s"`]+/gi, '$HOME');
  output = output.replace(/C:\\Users\\[^\\\s"`]+/gi, '$HOME');
  output = output.replace(/\/Users\/[^/\s"`]+/g, '$HOME');
  output = output.replace(/\/home\/[^/\s"`]+/g, '$HOME');
  output = output.replace(/C:\\\\projects\\\\[^\\\\\s"`]+/gi, '$PWD');
  output = output.replace(/C:\\projects\\[^\\\s"`]+/gi, '$PWD');
  return output;
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function writeProposal(transcript, analysis) {
  fs.mkdirSync(outputDir, { recursive: true });
  const slug = timestampSlug();
  const base = path.join(outputDir, `${slug}-${agent}-skill-evolution`);
  const proposal = {
    version: 1,
    status: 'proposed',
    createdAt: new Date().toISOString(),
    agent,
    cwd: redact(cwd),
    source: redact(transcript.path),
    skillDir: skillDir ? redact(path.resolve(skillDir)) : null,
    score: analysis.score,
    triggers: analysis.triggers,
    counts: analysis.counts,
    evidence: analysis.evidence,
    candidateTargets: inferTargets(transcript.messages || [], skillDir),
    recommendedNextSteps: [
      'Read the cited evidence in the source transcript.',
      'Classify each lesson as durable rule, script, eval, reference, or one-off state.',
      'Create the smallest diff against the relevant skill.',
      'Run validate-skill-package.js and any task-specific evals.',
      'Apply only after approval; use a branch or draft PR for broad changes.',
    ],
  };

  fs.writeFileSync(`${base}.json`, JSON.stringify(proposal, null, 2));
  fs.writeFileSync(`${base}.md`, formatMarkdown(proposal));
  return { json: `${base}.json`, markdown: `${base}.md`, proposal };
}

function formatMarkdown(proposal) {
  const lines = [
    '# Skill Evolution Proposal',
    '',
    `Status: ${proposal.status}`,
    `Agent: ${proposal.agent}`,
    `Created: ${proposal.createdAt}`,
    `Source: ${proposal.source}`,
    `CWD: ${proposal.cwd}`,
    `Score: ${proposal.score}`,
    '',
    '## Triggers',
    '',
    ...(proposal.triggers.length ? proposal.triggers.map((item) => `- ${item}`) : ['- No strong trigger detected. Review manually before acting.']),
    '',
    '## Candidate Targets',
    '',
    ...(proposal.candidateTargets.length ? proposal.candidateTargets.map((item) => `- ${item}`) : ['- No obvious skill target inferred.']),
    '',
    '## Evidence',
    '',
  ];

  for (const item of proposal.evidence) {
    lines.push(`### ${item.type} ${item.timestamp || ''}`.trim());
    lines.push('');
    lines.push('```text');
    lines.push(item.excerpt);
    lines.push('```');
    lines.push('');
  }

  lines.push('## Recommended Next Steps', '');
  for (const item of proposal.recommendedNextSteps) lines.push(`- ${item}`);
  lines.push('');
  return lines.join('\n');
}

if (!Number.isFinite(minToolCalls) || minToolCalls < 1) {
  die('--min-tool-calls must be a positive integer');
}

const transcript = runExtractor();
const analysis = scoreMessages(transcript.messages || []);
const output = writeProposal(transcript, analysis);

console.log(JSON.stringify({
  proposal: output.json,
  markdown: output.markdown,
  score: output.proposal.score,
  triggers: output.proposal.triggers,
}, null, 2));
