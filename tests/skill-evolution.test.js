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
