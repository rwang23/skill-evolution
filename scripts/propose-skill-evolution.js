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
let agent = null;
let cwd = process.cwd();
let cwdSupplied = false;
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
  if (arg === '--help' || arg === '-h') {
    console.log('Usage: node propose-skill-evolution.js <session-file> [--target-skill-dir <directory>] [--baseline-report <audit.json>] [--output-dir <directory>]\nOr: --session-dir <directory> [--cwd <project>]');
    process.exit(0);
  } else if (arg === '--agent' && args[index + 1]) {
    agent = args[++index];
  } else if (arg === '--cwd' && args[index + 1]) {
    cwd = args[++index];
    cwdSupplied = true;
  } else if (arg === '--session-dir' && args[index + 1]) {
    sessionDir = args[++index];
  } else if ((arg === '--target-skill-dir' || arg === '--skill-dir') && args[index + 1]) {
    targetSkillDir = args[++index];
  } else if (arg === '--baseline-report' && args[index + 1]) {
    baselineReport = args[++index];
  } else if (arg === '--output-dir' && args[index + 1]) {
    outputDir = args[++index];
  } else if (arg === '--min-tool-calls' && args[index + 1]) {
    minToolCalls = Number(args[++index]);
  } else if (arg === '--min-signal-score' && args[index + 1]) {
    minSignalScore = Number(args[++index]);
  } else if (arg === '--query' && args[index + 1]) {
    query = args[++index];
  } else if (arg === '--include-system') {
    includeSystem = true;
  } else if (arg === '--no-redact-paths') {
    redactPaths = false;
  } else if (!arg.startsWith('-')) {
    sessionPath = arg;
  } else {
    die('Unknown option or missing option value.');
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
    '--format',
    'json',
    '--include-tool-output',
    '--max-messages',
    '500',
  ];
  if (agent) commandArgs.push('--agent', agent);
  if (cwdSupplied) commandArgs.push('--cwd', cwd);
  if (sessionPath) commandArgs.splice(1, 0, sessionPath);
  if (sessionDir) commandArgs.push('--session-dir', sessionDir);
  if (query) commandArgs.push('--query', query);

  const result = spawnSync(process.execPath, commandArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) die(`Extractor failed: ${result.error.code || 'unknown error'}; use a smaller focused export.`);
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
    correction: [/\byou (?:missed|skipped|forgot|used the wrong)\b/i, /\b(?:routing|skill|workflow|output) (?:was|is) wrong\b/i, /\byou should have\b/i, /not what i asked/i, /(?:你|刚才|上次|这次|又).{0,40}(?:不对|错了|选错|遗漏|漏掉)/, /不是.{0,20}(?:我让|我要|我说|要求)/],
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
  let repeatedCorrection = false;

  function capture(type, message) {
    // Redact the full message before truncating so a boundary cannot expose a token prefix.
    const excerpt = redact(String(message.content || '')).slice(0, 600);
    const fingerprint = `${type}:${message.source_line}:${message.timestamp}:${excerpt}`;
    if (!excerpt || seen.has(fingerprint)) return;
    seen.add(fingerprint);
    evidence.push({
      id: `E${String(evidence.length + 1).padStart(2, '0')}`,
      type,
      role: message.role || 'unknown',
      timestamp: message.timestamp || null,
      source_line: message.source_line || null,
      excerpt,
      source: 'session',
      classification: 'heuristic; review source context',
    });
  }

  for (const message of messages) {
    if (!includeSystem && ['system', 'developer'].includes(message.role)) continue;
    const text = String(message.content || '');
    if (message.role === 'tool_call') counts.toolCalls += 1;
    if (message.role === 'tool_output') counts.toolOutputs += 1;
    const isCorrection = message.role === 'user' && matchesAny(text, patterns.correction);
    const isFailure = message.role === 'tool_output' && matchesAny(text, patterns.error);
    if (isCorrection) {
      counts.userCorrections += 1;
      if (/\bagain\b|repeat(?:ed|ing)?|recurr|再次|又|反复|重复|每次/i.test(text)) repeatedCorrection = true;
      capture('user-correction', message);
    }
    if (isFailure) {
      counts.errorSignals += 1;
      capture('error-signal', message);
    }
    if ((isCorrection || isFailure) && matchesAny(text, patterns.routing)) {
      counts.routingSignals += 1;
    }
    if (matchesAny(text, patterns.workflow)) {
      counts.workflowSignals += 1;
    }
  }

  let score = 0;
  if (counts.toolCalls >= minToolCalls) score += 1;
  score += Math.min(counts.userCorrections * 4, 12);
  score += Math.min(counts.errorSignals * 2, 6);
  const strongEvidence = counts.userCorrections > 0 &&
    (repeatedCorrection || counts.userCorrections >= 2 || counts.errorSignals > 0);
  const triggers = [];
  if (counts.userCorrections) triggers.push(`user corrections: ${counts.userCorrections}`);
  if (counts.errorSignals) triggers.push(`error or dead-end signals: ${counts.errorSignals}`);
  if (repeatedCorrection) triggers.push('User feedback describes recurrence; independent sessions still require review.');
  if (counts.toolCalls >= minToolCalls) triggers.push(`complex task: ${counts.toolCalls} tool calls`);
  const selectedEvidence = evidence
    .sort((left, right) => Number(right.type === 'user-correction') - Number(left.type === 'user-correction'))
    .slice(0, 16)
    .map((item, index) => ({ ...item, id: `E${String(index + 1).padStart(2, '0')}` }));
  return {
    score,
    threshold: minSignalScore,
    strongEvidence,
    decision: score >= minSignalScore && strongEvidence ? 'proposal' : 'no-candidate',
    triggers,
    counts,
    evidence: selectedEvidence,
    evidenceOmitted: Math.max(0, evidence.length - selectedEvidence.length),
  };
}

function targetNameFromDir(value) {
  if (!value) return null;
  return path.basename(path.resolve(value));
}

function inferTargetNames(messages) {
  const names = new Set();
  if (targetSkillDir) return [targetNameFromDir(targetSkillDir)];
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = redact(message.content);
    const matches = text.match(/\$[a-z0-9]+(?:-[a-z0-9]+)+/gi) || [];
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
  const score = payload.total_score ?? payload.score ?? payload.summary?.quality_score ?? payload.summary?.average_score ?? null;
  const status = payload.status ?? payload.verdict ?? payload.summary?.gate_status ?? payload.summary?.status ?? null;
  return {
    supplied: true,
    path: redact(resolved),
    status: typeof status === 'string' ? redact(status) : null,
    score: typeof score === 'number' ? score : null,
    evidence_grade: typeof payload.evidence?.grade === 'string' ? redact(payload.evidence.grade) : null,
    rubric_version: typeof payload.rubric_version === 'string' ? redact(payload.rubric_version) : null,
    revision_verified: false,
    note: 'Optional external evidence; target revision was not verified. Artifact score and evidence grade do not establish effectiveness or grant apply authority.',
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
      agent: transcript.agent,
      cwd: redact(path.resolve(cwd)),
      transcript: redact(transcript.path),
      baseline_report: baseline,
      coverage: transcript.coverage,
    },
    signal_assessment: {
      score: analysis.score,
      threshold: analysis.threshold,
      strong_evidence: analysis.strongEvidence,
      evidence_basis: 'heuristic screening, not verified incident counts',
      generalization_status: 'unreviewed',
      triggers: analysis.triggers,
      counts: analysis.counts,
      evidence_excerpts_omitted: analysis.evidenceOmitted,
      reason:
        status === 'proposal'
          ? 'The signal threshold and strong-evidence condition were met; human review must still test generalization.'
          : 'No sufficiently corroborated user correction was found. Keywords, assistant assertions, and isolated tool errors do not establish a reusable lesson.',
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
      required: ['Review every evidence excerpt in its source context and inspect coverage gaps.', 'Compare baseline and candidate on the same task; keep held-out tasks separate.', 'Run a target-specific regression check before any later edit.'],
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
    lines.push(`### ${item.id}: ${item.type}`, '', `Source line: ${item.source_line || 'unavailable'}; ${item.classification}`, '', '```text', item.excerpt, '```', '');
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
    '## Coverage and validation',
    '',
    `Coverage: ${JSON.stringify(proposal.source.coverage)}`,
    'Generalization: unreviewed. Signal counts are heuristic screening, not independent incidents.',
    '',
    ...proposal.validation.required.map((item) => `- ${item}`),
    '',
    '## Review boundary',
    '',
    `Recommended candidate: ${proposal.recommended_candidate || 'none'}`,
    'The target package was not changed. apply_plan remains null; implementation belongs to a separately authorized workflow.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function writeProposal(transcript, analysis, baseline) {
  fs.mkdirSync(outputDir, { recursive: true });
  const proposal = buildProposal(transcript, analysis, baseline);
  const base = path.join(outputDir, `${timestampSlug(proposal.created_at)}-${transcript.agent}-skill-evolution`);
  const jsonPath = `${base}.json`;
  const markdownPath = `${base}.md`;
  fs.writeFileSync(jsonPath, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, markdownFor(proposal), 'utf8');
  return { proposal, jsonPath, markdownPath };
}

if (!Number.isSafeInteger(minToolCalls) || minToolCalls < 1) die('--min-tool-calls must be a positive integer');
if (!Number.isSafeInteger(minSignalScore) || minSignalScore < 1) die('--min-signal-score must be a positive integer');
if (agent && !['generic', 'codex', 'claude', 'pi', 'hermes', 'antigravity'].includes(agent)) die('Unsupported --agent value');

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
