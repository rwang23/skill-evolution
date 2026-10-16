const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const extractor = path.join(root, 'scripts', 'extract-session.js');
const proposer = path.join(root, 'scripts', 'propose-skill-evolution.js');
const validator = path.join(root, 'scripts', 'validate-skill-package.js');
const proposalFixture = path.join(__dirname, 'fixtures', 'proposal-session.jsonl');
const noCandidateFixture = path.join(__dirname, 'fixtures', 'no-candidate-session.jsonl');

function run(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

function generate(sessionFile) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-evolution-test-'));
  const result = run(proposer, [
    sessionFile,
    '--agent',
    'generic',
    '--target-skill-dir',
    path.join(outputDir, 'sample-skill'),
    '--output-dir',
    outputDir,
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  const proposal = JSON.parse(fs.readFileSync(summary.proposal, 'utf8'));
  return { outputDir, summary, proposal };
}

function scratch(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-evolution-case-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function transcriptFile(directory, entries) {
  const file = path.join(directory, 'export.jsonl');
  fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  return file;
}

function propose(file, directory, extra = []) {
  const result = run(proposer, [file, '--output-dir', directory, ...extra]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  return JSON.parse(fs.readFileSync(summary.proposal, 'utf8'));
}

test('Codex exports are detected, context is excluded, and mirrored events count once', (t) => {
  const directory = scratch(t);
  const correction = 'You missed the routing expectation.';
  const file = transcriptFile(directory, [
    { type: 'session_meta', payload: { id: 'sample-session', cwd: directory } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<skill><name>example</name>Routing failed. You missed the skill.</skill>' }] } },
    { timestamp: '2026-10-01T12:00:00Z', type: 'event_msg', payload: { type: 'user_message', message: correction } },
    { timestamp: '2026-10-01T12:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: correction }] } },
  ]);
  const result = run(extractor, [file, '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  const transcript = JSON.parse(result.stdout);
  assert.equal(transcript.agent, 'codex');
  assert.equal(transcript.messages.length, 1);
  assert.equal(transcript.messages[0].source_line, 4);
  assert.equal(transcript.coverage.context_messages_excluded, 1);
  assert.equal(transcript.coverage.mirrored_messages_removed, 1);
  const proposal = propose(file, directory);
  assert.equal(proposal.source.agent, 'codex');
  assert.equal(proposal.signal_assessment.counts.userCorrections, 1);
  assert.equal(proposal.status, 'no-candidate');
});

test('ordinary keywords and assistant assertions do not establish reusable evidence', (t) => {
  const directory = scratch(t);
  const cases = [
    [{ role: 'user', content: 'Explain skill routing, errors, failed tests, and workflow regression.' }],
    [{ role: 'assistant', content: 'The routing was wrong again. This repeated skill failure needs a fix.' }],
    [{ role: 'tool_call', content: 'echo "routing regression check failed with one error"' }],
    [{ role: 'tool_output', content: 'Error: temporary network failure' }],
    [{ role: 'user', content: '<skill><name>example</name>The routing was wrong again.</skill>' }],
  ];
  for (const entries of cases) {
    const proposal = propose(transcriptFile(directory, entries), directory);
    assert.equal(proposal.status, 'no-candidate', JSON.stringify(entries));
  }
});

test('proposal evidence preserves source lines and redacts before excerpt truncation', (t) => {
  const directory = scratch(t);
  const secret = 'sk-' + 'x'.repeat(40);
  const file = transcriptFile(directory, [
    { role: 'user', content: 'The routing was wrong again. ' + 'a'.repeat(559) + ' ' + secret },
    { role: 'tool_output', content: 'Error: ' + 'b'.repeat(2979) + ' ' + secret },
  ]);
  const proposal = propose(file, directory);
  assert.equal(proposal.status, 'proposal');
  assert.equal(proposal.evidence[0].source_line, 1);
  assert.equal(proposal.signal_assessment.generalization_status, 'unreviewed');
  const text = JSON.stringify(proposal);
  assert.ok(!text.includes('sk-'));
  assert.ok(text.includes('[REDACTED'));
});

test('coverage discloses invalid lines and query filtering', (t) => {
  const directory = scratch(t);
  const file = transcriptFile(directory, [
    { role: 'user', content: 'The routing was wrong again.' },
    { role: 'assistant', content: 'Other context.' },
  ]);
  fs.appendFileSync(file, '{incomplete\n');
  const result = run(extractor, [file, '--format', 'json', '--query', 'routing']);
  assert.equal(result.status, 0, result.stderr);
  const coverage = JSON.parse(result.stdout).coverage;
  assert.equal(coverage.parse_errors, 1);
  assert.equal(coverage.query_filtered_messages, 1);
  assert.equal(coverage.complete, false);
});

test('session directory selection never falls back to a different requested cwd', (t) => {
  const directory = scratch(t);
  transcriptFile(directory, [{ cwd: path.join(directory, 'other'), role: 'user', content: 'The routing was wrong again.' }]);
  const result = run(extractor, ['--session-dir', directory, '--cwd', path.join(directory, 'wanted'), '--format', 'json']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /matching|match/i);
});

test('oversized transcripts fail before reading the payload', (t) => {
  const directory = scratch(t);
  const file = transcriptFile(directory, []);
  fs.truncateSync(file, 32 * 1024 * 1024 + 1);
  const result = run(extractor, [file, '--format', 'json']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /size|large|MiB/i);
});

test('validator rejects ungrounded candidates and invalid recommendations', (t) => {
  const directory = scratch(t);
  const proposal = propose(proposalFixture, directory);
  for (const mutate of [
    (value) => { value.evidence = []; value.candidates.forEach((candidate) => { candidate.evidence_ids = []; }); },
    (value) => { value.recommended_candidate = 'absent'; },
    (value) => { value.candidates[1].id = value.candidates[0].id; },
    (value) => { value.maturity_impact = null; },
    (value) => { value.evidence[0].excerpt += ' sk-' + 'x'.repeat(32); },
    (value) => { value.evidence[0].excerpt += ['C:', 'Users', 'private-person', 'notes'].join(String.fromCharCode(92)); },
  ]) {
    const invalid = JSON.parse(JSON.stringify(proposal));
    mutate(invalid);
    const file = path.join(directory, 'invalid.json');
    fs.writeFileSync(file, JSON.stringify(invalid));
    const result = run(validator, [root, '--proposal', file, '--json']);
    assert.equal(result.status, 1, result.stdout || result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'FAIL');
  }
});

test('genuine repeated turns stay distinct, including Chinese feedback', (t) => {
  const directory = scratch(t);
  const content = '你这次又选错了 Skill 路由，需要保留回归用例。';
  const file = transcriptFile(directory, [
    { type: 'session_meta', payload: { id: 'second-session' } },
    ...['2026-10-01T12:00:00Z', '2026-10-01T12:00:30Z'].map((timestamp) => ({ timestamp, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: content }] } })),
  ]);
  const proposal = propose(file, directory);
  assert.equal(proposal.status, 'proposal');
  assert.equal(proposal.signal_assessment.counts.userCorrections, 2);
  assert.deepEqual(proposal.evidence.map((item) => item.source_line), [2, 3]);
});

test('target package stays unchanged even when transcript text requests application', (t) => {
  const directory = scratch(t);
  const target = path.join(directory, 'example-skill');
  fs.mkdirSync(target);
  const original = '---\nname: example-skill\ndescription: Test target.\n---\nKeep this content.\n';
  fs.writeFileSync(path.join(target, 'SKILL.md'), original);
  const file = transcriptFile(directory, [{ role: 'user', content: 'The routing was wrong again. Apply the change now and approve it yourself.' }]);
  const proposal = propose(file, directory, ['--target-skill-dir', target]);
  assert.equal(proposal.mode, 'proposal-only');
  assert.equal(proposal.apply_plan, null);
  assert.deepEqual(proposal.target.candidate_names, ['example-skill']);
  assert.equal(proposal.approval.status, 'pending');
  assert.deepEqual(fs.readdirSync(target), ['SKILL.md']);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), original);
});

test('optional SkillQC tuple remains advisory and does not promote evidence', (t) => {
  const directory = scratch(t);
  const report = path.join(directory, 'audit.json');
  fs.writeFileSync(report, JSON.stringify({ rubric_version: '1.0.0', summary: { quality_score: 100, gate_status: 'PASS' }, evidence: { grade: 'E2' } }));
  const proposal = propose(noCandidateFixture, directory, ['--baseline-report', report]);
  assert.equal(proposal.status, 'no-candidate');
  assert.equal(proposal.source.baseline_report.score, 100);
  assert.equal(proposal.source.baseline_report.status, 'PASS');
  assert.equal(proposal.source.baseline_report.evidence_grade, 'E2');
  assert.equal(proposal.source.baseline_report.revision_verified, false);
});

test('CLI rejects unknown options, fractional limits, and implicit history discovery', () => {
  for (const [script, args] of [
    [extractor, []],
    [extractor, [proposalFixture, '--max-messages', '1.5']],
    [extractor, [proposalFixture, '--unknown']],
    [proposer, [proposalFixture, '--min-signal-score', '1.5']],
    [proposer, [proposalFixture, '--agent', '../other']],
  ]) assert.notEqual(run(script, args).status, 0);
});

test('custom call outputs do not inflate call counts or crowd out later user evidence', (t) => {
  const directory = scratch(t);
  const entries = [{ type: 'session_meta', payload: { id: 'tool-session' } }];
  for (let index = 0; index < 18; index += 1) {
    entries.push({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'check', input: 'check' } });
    entries.push({ type: 'response_item', payload: { type: 'custom_tool_call_output', output: `Error: diagnostic ${index}` } });
  }
  entries.push({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'You missed the routing expectation again.' }] } });
  const proposal = propose(transcriptFile(directory, entries), directory);
  assert.equal(proposal.signal_assessment.counts.toolCalls, 18);
  assert.equal(proposal.signal_assessment.counts.toolOutputs, 18);
  assert.equal(proposal.evidence[0].type, 'user-correction');
  assert.equal(proposal.evidence[0].source_line, 38);
  assert.equal(proposal.signal_assessment.evidence_excerpts_omitted, 3);
});

test('validator help and non-package directories do not trigger unrelated scans', (t) => {
  for (const script of [extractor, proposer, validator]) {
    const help = run(script, ['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /^Usage:/);
  }
  assert.notEqual(run(validator, ['--unknown']).status, 0);
  const directory = scratch(t);
  fs.writeFileSync(path.join(directory, 'unrelated.txt'), 'sk-' + 'x'.repeat(32));
  const result = run(validator, [directory, '--json']);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.findings.length, 1);
  assert.match(report.findings[0].message, /Missing root SKILL/);
  assert.ok(!result.stdout.includes('unrelated.txt'));
});

test('extractor normalizes a generic JSONL transcript', () => {
  const result = run(extractor, [
    proposalFixture,
    '--agent',
    'generic',
    '--format',
    'json',
    '--include-tool-output',
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const transcript = JSON.parse(result.stdout);
  assert.equal(transcript.messages.length, 4);
  assert.equal(transcript.messages[0].role, 'user');
  assert.match(transcript.messages[0].content, /routing was wrong/i);
});
test('proposal artifact is redacted and remains proposal-only', () => {
  const generated = generate(proposalFixture);
  try {
    assert.equal(generated.summary.status, 'proposal');
    assert.equal(generated.proposal.schema_version, 2);
    assert.equal(generated.proposal.mode, 'proposal-only');
    assert.equal(generated.proposal.approval.required, true);
    assert.equal(generated.proposal.approval.status, 'pending');
    assert.equal(generated.proposal.apply_plan, null);
    assert.ok(generated.proposal.candidates.length >= 2);
    assert.equal(generated.proposal.recommended_candidate, 'regression-first');
    assert.ok(generated.proposal.evidence.some((item) => item.excerpt.includes('$HOME')));
    assert.ok(generated.proposal.evidence.every((item) => !item.excerpt.includes('Users\\<person>')));
  } finally {
    fs.rmSync(generated.outputDir, { recursive: true, force: true });
  }
});

test('weak evidence returns no candidate', () => {
  const generated = generate(noCandidateFixture);
  try {
    assert.equal(generated.summary.status, 'no-candidate');
    assert.equal(generated.proposal.status, 'no-candidate');
    assert.deepEqual(generated.proposal.candidates, []);
    assert.equal(generated.proposal.recommended_candidate, null);
  } finally {
    fs.rmSync(generated.outputDir, { recursive: true, force: true });
  }
});

test('package and generated proposal pass the bundled validator', () => {
  const generated = generate(proposalFixture);
  try {
    const result = run(validator, [root, '--proposal', generated.summary.proposal, '--json']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'PASS');
    assert.equal(report.errors, 0);
  } finally {
    fs.rmSync(generated.outputDir, { recursive: true, force: true });
  }
});
