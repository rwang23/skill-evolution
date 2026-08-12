#!/usr/bin/env node

/**
 * Generate proposal-only Skill evolution artifacts from transcript evidence.
 *
 * This script never edits a target Skill. It uses only Node.js standard-library
 * modules and the extractor bundled in this repository.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let sessionPath = null;
let sessionDir = null;
let agent = 'generic';
let cwd = process.cwd();
let targetSkillDir = null;
let baselineReport = null;
let outputDir = path.join(os.homedir(), '.agent-skill-evolution', 'proposals');
let minToolCalls = 5;
let minSignalScore = 4;
let query = null;
let includeSystem = false;
let redactPaths = true;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--agent' && args[index + 1]) {
    agent = args[++index];
  } else if (arg === '--cwd' && args[index + 1]) {
    cwd = args[++index];
  } else if (arg === '--session-dir' && args[index + 1]) {
    sessionDir = args[++index];
  } else if ((arg === '--target-skill-dir' || arg === '--skill-dir') && args[index + 1]) {
    targetSkillDir = args[++index];
  } else if (arg === '--baseline-report' && args[index + 1]) {
    baselineReport = args[++index];
  } else if (arg === '--output-dir' && args[index + 1]) {
    outputDir = args[++index];
  } else if (arg === '--min-tool-calls' && args[index + 1]) {
    minToolCalls = Number.parseInt(args[++index], 10);
  } else if (arg === '--min-signal-score' && args[index + 1]) {
    minSignalScore = Number.parseInt(args[++index], 10);
  } else if (arg === '--query' && args[index + 1]) {
    query = args[++index];
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

function redact(value) {
  let output = String(value || '');
  output = output.replace(/\bsk-[a-z0-9_-]{12,}\b/gi, '[REDACTED_TOKEN]');
  output = output.replace(/\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, '[REDACTED_TOKEN]');
  output = output.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_TOKEN]');
  output = output.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
  if (!redactPaths) return output;

  const home = os.homedir();
  const resolvedCwd = path.resolve(cwd);
  for (const [source, replacement] of [
    [home, '$HOME'],
    [home && home.replace(/\\/g, '/'), '$HOME'],
    [resolvedCwd, '$PWD'],
    [resolvedCwd.replace(/\\/g, '/'), '$PWD'],
  ]) {
    if (source) output = output.split(source).join(replacement);
  }
  output = output.replace(/[A-Z]:\\[^\\\s"`]+\\[^\\\s"`]+/gi, (match) =>
    /:\\Users\\/i.test(match) ? '$HOME' : match,
  );
  output = output.replace(/\/(?:Users|home)\/[^/\s"`]+/g, '$HOME');
  return output;
}

function runExtractor() {
  const extractor = path.join(__dirname, 'extract-session.js');
  if (!fs.existsSync(extractor)) die(`Missing bundled extractor: ${extractor}`);
  const commandArgs = [
    extractor,
    '--agent',
    agent,
    '--cwd',
    cwd,
    '--format',
    'json',
    '--include-tool-output',
    '--max-messages',
    '500',
  ];
  if (sessionPath) commandArgs.splice(1, 0, sessionPath);
  if (sessionDir) commandArgs.push('--session-dir', sessionDir);
  if (query) commandArgs.push('--query', query);

  const result = spawnSync(process.execPath, commandArgs, { encoding: 'utf8' });
  if (result.status !== 0) die(`Extractor failed:\n${result.stderr || result.stdout}`);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    return die(`Extractor did not return JSON: ${error.message}`);
  }
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function analyze(messages) {
  const patterns = {
    correction: [/\bwrong\b/i, /you missed/i, /should have/i, /not what i asked/i, /不是/, /不对/, /遗漏/, /应该/, /纠正/],
    error: [/\berror\b/i, /\bfailed\b/i, /exception/i, /traceback/i, /denied/i, /失败/, /报错/, /错误/],
    routing: [/routing/i, /trigger/i, /should[_ -]?trigger/i, /wrong skill/i, /路由/, /触发/, /选错.*skill/i],
    workflow: [/repeat(?:ed|ing)?/i, /recurr/i, /workflow/i, /regression/i, /skill/i, /harness/i, /重复/, /流程/, /回归/, /技能/, /进化/],
  };
  const counts = {
    toolCalls: 0,
    toolOutputs: 0,
    userCorrections: 0,
    errorSignals: 0,
    routingSignals: 0,
    workflowSignals: 0,
  };
  const evidence = [];
  const seen = new Set();

  function capture(type, message) {
    if (evidence.length >= 16) return;
    const excerpt = redact(String(message.content || '').slice(0, 600));
    const fingerprint = `${type}:${excerpt}`;
    if (!excerpt || seen.has(fingerprint)) return;
    seen.add(fingerprint);
    evidence.push({
      id: `E${String(evidence.length + 1).padStart(2, '0')}`,
      type,
      role: message.role || 'unknown',
      timestamp: message.timestamp || null,
      excerpt,
      source: 'session',
    });
  }

  for (const message of messages) {
    if (!includeSystem && ['system', 'developer'].includes(message.role)) continue;
    const text = String(message.content || '');
    if (message.role === 'tool_call' || /tool_call/i.test(message.kind || '')) counts.toolCalls += 1;
    if (message.role === 'tool_output' || /tool_output/i.test(message.kind || '')) counts.toolOutputs += 1;
    if (message.role === 'user' && matchesAny(text, patterns.correction)) {
      counts.userCorrections += 1;
      capture('user-correction', message);
    }
    if (matchesAny(text, patterns.error)) {
      counts.errorSignals += 1;
      capture('error-signal', message);
    }
    if (matchesAny(text, patterns.routing)) {
      counts.routingSignals += 1;
      capture('routing-signal', message);
    }
    if (matchesAny(text, patterns.workflow)) {
      counts.workflowSignals += 1;
      capture('workflow-signal', message);
    }
  }

  let score = 0;
  if (counts.toolCalls >= minToolCalls) score += 1;
  score += Math.min(counts.userCorrections * 4, 12);
  score += Math.min(counts.errorSignals * 2, 6);
  score += Math.min(counts.routingSignals * 2, 6);
  score += Math.min(counts.workflowSignals, 4);

  const strongEvidence =
    counts.userCorrections > 0 ||
    counts.errorSignals > 0 ||
    counts.routingSignals > 0 ||
    counts.workflowSignals >= 2;
  const triggers = [];
  if (counts.userCorrections) triggers.push(`user corrections: ${counts.userCorrections}`);
  if (counts.errorSignals) triggers.push(`error or dead-end signals: ${counts.errorSignals}`);
  if (counts.routingSignals) triggers.push(`routing signals: ${counts.routingSignals}`);
  if (counts.workflowSignals >= 2) triggers.push(`repeated workflow signals: ${counts.workflowSignals}`);
  if (counts.toolCalls >= minToolCalls) triggers.push(`complex task: ${counts.toolCalls} tool calls`);
  return {
    score,
    threshold: minSignalScore,
    strongEvidence,
    decision: score >= minSignalScore && strongEvidence ? 'proposal' : 'no-candidate',
    triggers,
    counts,
    evidence,
  };
}

function targetNameFromDir(value) {
  if (!value) return null;
  return path.basename(path.resolve(value));
}

function inferTargetNames(messages) {
  const names = new Set();
  if (targetSkillDir) names.add(targetNameFromDir(targetSkillDir));
  for (const message of messages) {
    const text = String(message.content || '');
    const matches = text.match(/\$?[a-z0-9]+(?:-[a-z0-9]+)+/gi) || [];
    for (const match of matches) {
      const name = match.replace(/^\$/, '').toLowerCase();
      if (name.length <= 64) names.add(name);
    }
  }
  return [...names].filter(Boolean).slice(0, 8);
}

function readBaseline() {
  if (!baselineReport) return null;
  const resolved = path.resolve(baselineReport);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    die(`Cannot read --baseline-report as JSON: ${error.message}`);
  }
  const score = payload.total_score ?? payload.score ?? payload.summary?.average_score ?? null;
  const status = payload.status ?? payload.verdict ?? payload.summary?.status ?? null;
  return {
    supplied: true,
    path: redact(resolved),
    status: typeof status === 'string' ? status : null,
    score: typeof score === 'number' ? score : null,
    note: 'Optional external evidence; it does not grant apply authority.',
  };
}

function targetSurface(analysis) {
  if (analysis.counts.routingSignals > 0) return 'SKILL.md frontmatter description or routing eval';
  if (analysis.counts.errorSignals > 0) return 'smallest workflow step, script, or regression fixture tied to the failure';
  return 'smallest durable SKILL.md, reference, script, or eval surface supported by review';
}

function buildCandidates(analysis) {
  const evidenceIds = analysis.evidence.map((item) => item.id);
  const surface = targetSurface(analysis);
  return [
    {
      id: 'minimal-contract',
      label: 'Smallest durable contract change',
      target_surface: surface,
      intended_behavior: 'Prevent or shorten the evidenced failure with one bounded instruction or deterministic check.',
      rationale: 'Changes the narrowest reusable surface that directly addresses the observed behavior.',
      evidence_ids: evidenceIds,
      validation: ['Add one focused regression case.', 'Run the target package validator and its relevant functional check.'],
      risk: 'medium',
      tradeoff: 'May miss a wider harness cause if the evidence set is incomplete.',
    },
    {
      id: 'regression-first',
      label: 'Add evidence without broad behavior change',
      target_surface: 'eval or replay fixture',
      intended_behavior: 'Make the observed miss reproducible before changing the active workflow.',
      rationale: 'Improves evidence quality and reduces the risk of over-generalizing a single session.',
      evidence_ids: evidenceIds,
      validation: ['Replay the fixture against the current baseline.', 'Record the observed failure before any later edit.'],
      risk: 'low',
      tradeoff: 'Does not immediately change the target Skill behavior.',
    },
    {
      id: 'observe-more',
      label: 'Collect another independent observation',
      target_surface: null,
      intended_behavior: 'Defer package changes until a second observation confirms the same reusable lesson.',
      rationale: 'Use when the current evidence is specific, ambiguous, or weakly attributed.',
      evidence_ids: evidenceIds,
      validation: ['Define the next observable trigger and expected result.'],
      risk: 'low',
      tradeoff: 'Delays a possible improvement while evidence accumulates.',
    },
  ];
}

function timestampSlug(timestamp) {
  return timestamp.replace(/[:.]/g, '-');
}

function buildProposal(transcript, analysis, baseline) {
  const createdAt = new Date().toISOString();
  const status = analysis.decision;
  return {
    schema_version: 2,
    artifact_type: 'skill-evolution-proposal',
    status,
    mode: 'proposal-only',
    created_at: createdAt,
    source: {
      agent,
      cwd: redact(path.resolve(cwd)),
      transcript: redact(transcript.path),
      baseline_report: baseline,
    },
    signal_assessment: {
      score: analysis.score,
      threshold: analysis.threshold,
      strong_evidence: analysis.strongEvidence,
      triggers: analysis.triggers,
      counts: analysis.counts,
      reason:
        status === 'proposal'
          ? 'The signal threshold and strong-evidence condition were met; human review must still test generalization.'
          : 'The current evidence does not meet both the deterministic threshold and strong-evidence condition.',
    },
    target: {
      skill_dir: targetSkillDir ? redact(path.resolve(targetSkillDir)) : null,
      candidate_names: inferTargetNames(transcript.messages || []),
      smallest_surface_hint: targetSurface(analysis),
    },
    evidence: analysis.evidence,
    maturity_impact: {
      decision: status === 'proposal' ? 'observe more evidence' : 'no-skill',
      observed_fact: analysis.triggers.join('; ') || 'No durable signal established.',
      additional_gates: [],
      missing_evidence: ['Current target maturity and its gate results were not established by transcript scoring.'],
    },
    candidates: status === 'proposal' ? buildCandidates(analysis) : [],
    recommended_candidate: status === 'proposal' ? 'regression-first' : null,
    validation: {
      package: 'node <skill-root>/scripts/validate-skill-package.js <skill-root>',
      proposal: 'node <skill-root>/scripts/validate-skill-package.js <skill-root> --proposal <proposal.json>',
      required: ['Review every evidence excerpt in its source context.', 'Run a target-specific regression check before any later edit.'],
    },
    approval: {
      required: true,
      status: 'pending',
      note: 'A proposal is evidence for review, not authority to modify or publish a Skill.',
    },
    apply_plan: null,
  };
}

function markdownFor(proposal) {
  const lines = [
    '# Skill Evolution proposal',
    '',
    `Status: ${proposal.status}`,
    `Mode: ${proposal.mode}`,
    `Created: ${proposal.created_at}`,
    `Source: ${proposal.source.transcript}`,
    `Signal score: ${proposal.signal_assessment.score}/${proposal.signal_assessment.threshold} threshold`,
    `Approval: ${proposal.approval.status}`,
    '',
    '## Signal assessment',
    '',
    proposal.signal_assessment.reason,
    '',
  ];
  if (proposal.signal_assessment.triggers.length) {
    lines.push(...proposal.signal_assessment.triggers.map((item) => `- ${item}`), '');
  }
  lines.push('## Evidence', '');
  if (!proposal.evidence.length) lines.push('- No qualifying evidence excerpt was captured.', '');
  for (const item of proposal.evidence) {
    lines.push(`### ${item.id}: ${item.type}`, '', '```text', item.excerpt, '```', '');
  }
  lines.push('## Candidates', '');
  if (!proposal.candidates.length) {
    lines.push('- No candidate. Collect another directly observed correction or failure before proposing a reusable change.', '');
  }
  for (const candidate of proposal.candidates) {
    lines.push(
      `### ${candidate.id}: ${candidate.label}`,
      '',
      `Target: ${candidate.target_surface || 'none'}`,
      '',
      candidate.rationale,
      '',
      `Risk: ${candidate.risk}`,
      `Tradeoff: ${candidate.tradeoff}`,
      '',
    );
  }
  lines.push(
    '## Review boundary',
    '',
    `Recommended candidate: ${proposal.recommended_candidate || 'none'}`,
    'No files were changed. apply_plan remains null until a separately authorized workflow acts on an accepted proposal.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function writeProposal(transcript, analysis, baseline) {
  fs.mkdirSync(outputDir, { recursive: true });
  const proposal = buildProposal(transcript, analysis, baseline);
  const base = path.join(outputDir, `${timestampSlug(proposal.created_at)}-${agent}-skill-evolution`);
  const jsonPath = `${base}.json`;
  const markdownPath = `${base}.md`;
  fs.writeFileSync(jsonPath, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, markdownFor(proposal), 'utf8');
  return { proposal, jsonPath, markdownPath };
}

if (!Number.isFinite(minToolCalls) || minToolCalls < 1) die('--min-tool-calls must be a positive integer');
if (!Number.isFinite(minSignalScore) || minSignalScore < 1) die('--min-signal-score must be a positive integer');

const transcript = runExtractor();
const analysis = analyze(transcript.messages || []);
const output = writeProposal(transcript, analysis, readBaseline());
console.log(
  JSON.stringify(
    {
      status: output.proposal.status,
      proposal: output.jsonPath,
      markdown: output.markdownPath,
      score: output.proposal.signal_assessment.score,
      threshold: output.proposal.signal_assessment.threshold,
    },
    null,
    2,
  ),
);
