#!/usr/bin/env node

/**
 * Count which Skills agent sessions actually used, as lower-bound routing evidence.
 *
 * Usage:
 *   node scripts/skill-usage-report.js --session-dir <dir> [--skills-root <dir> ...] [--since YYYY-MM-DD] [--format json|markdown] [--output <file>]
 *
 * Reads Claude Code and Codex JSONL transcripts. Evidence strength, strongest first: a Skill tool call
 * (`skill_tool`), a Read of `<skill>/SKILL.md` (`skill_md_read`), any other tool input that names the
 * path (`path_mention`, which includes listing, grep, and edits). Output has Skill names and counts only.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const sessionDirs = [];
const skillRoots = [];
let since = null;
let format = 'markdown';
let output = null;
const maxFileBytes = 64 * 1024 * 1024;
const skipDirs = new Set(['.git', 'node_modules', '__pycache__', 'tests', 'test', 'fixtures', 'examples', 'assets', 'references', '.system']);

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    console.log('Usage: node skill-usage-report.js --session-dir <dir> [--skills-root <dir> ...] [--since YYYY-MM-DD] [--format json|markdown] [--output <file>]');
    process.exit(0);
  } else if (arg === '--session-dir' && args[i + 1]) {
    sessionDirs.push(args[++i]);
  } else if (arg === '--skills-root' && args[i + 1]) {
    skillRoots.push(args[++i]);
  } else if (arg === '--since' && args[i + 1]) {
    since = Date.parse(args[++i]);
    if (Number.isNaN(since)) {
      console.error('--since must be a date such as 2026-10-01.');
      process.exit(1);
    }
  } else if (arg === '--format' && args[i + 1]) {
    format = args[++i].toLowerCase();
  } else if (arg === '--output' && args[i + 1]) {
    output = args[++i];
  } else {
    console.error('Unknown option or missing option value.');
    process.exit(1);
  }
}
if (!sessionDirs.length || !['json', 'markdown'].includes(format)) {
  console.error('Provide at least one --session-dir and use --format json or markdown.');
  process.exit(1);
}

function walk(dir, pattern, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, pattern, out);
    else if (pattern.test(entry.name)) out.push(full);
  }
  return out;
}

function installedSkills(root) {
  const names = new Map();
  (function scan(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.name === 'SKILL.md')) {
      let real = dir;
      try {
        real = fs.realpathSync(dir);
      } catch {
        // keep the unresolved path
      }
      names.set(path.basename(dir), real.toLowerCase());
    }
    for (const entry of entries) {
      if ((entry.isDirectory() || entry.isSymbolicLink()) && !skipDirs.has(entry.name)) scan(path.join(dir, entry.name));
    }
  })(root);
  return names;
}

const skillMdPath = /([A-Za-z0-9][A-Za-z0-9._-]{2,})[\\/]+SKILL\.md/g;

function usesInEntry(entry) {
  const found = [];
  const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
  for (const block of blocks) {
    if (block?.type !== 'tool_use') continue;
    if (block.name === 'Skill' && typeof block.input?.skill === 'string') {
      found.push({ skill: block.input.skill, via: 'skill_tool' });
      continue;
    }
    const text = JSON.stringify(block.input || {});
    const via = block.name === 'Read' ? 'skill_md_read' : 'path_mention';
    for (const match of text.matchAll(skillMdPath)) found.push({ skill: match[1], via });
  }
  const payload = entry.payload;
  if (payload && /function_call$/.test(payload.type || '') && typeof payload.arguments === 'string') {
    for (const match of payload.arguments.matchAll(skillMdPath)) found.push({ skill: match[1], via: 'path_mention' });
  }
  return found;
}

const usage = new Map();
const coverage = { files: 0, files_skipped_too_large: 0, parse_errors: 0, sessions_with_skill_use: 0 };

function record(skill, via, sessionId, timestamp) {
  const row = usage.get(skill) || { skill, skill_tool: 0, skill_md_read: 0, path_mention: 0, sessions: new Set(), last_seen: null };
  row[via] += 1;
  row.sessions.add(sessionId);
  if (timestamp && (!row.last_seen || timestamp > row.last_seen)) row.last_seen = timestamp;
  usage.set(skill, row);
}

for (const dir of sessionDirs) {
  for (const file of walk(dir, /\.jsonl$/i)) {
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      continue;
    }
    if (size > maxFileBytes) {
      coverage.files_skipped_too_large += 1;
      continue;
    }
    coverage.files += 1;
    let used = false;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line || (!line.includes('SKILL.md') && !line.includes('"Skill"'))) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        coverage.parse_errors += 1;
        continue;
      }
      const timestamp = entry.timestamp || entry.payload?.timestamp || null;
      if (since !== null && timestamp && Date.parse(timestamp) < since) continue;
      for (const hit of usesInEntry(entry)) {
        record(hit.skill, hit.via, file, timestamp);
        used = true;
      }
    }
    if (used) coverage.sessions_with_skill_use += 1;
  }
}

const installed = new Map();
for (const root of skillRoots) for (const [name, real] of installedSkills(root)) installed.set(name, real);
const rows = [...usage.values()]
  .map((row) => ({ ...row, sessions: row.sessions.size }))
  .sort((a, b) => b.skill_tool + b.skill_md_read - (a.skill_tool + a.skill_md_read) || b.path_mention - a.path_mention || a.skill.localeCompare(b.skill));
const observed = new Set(rows.map((row) => row.skill));
const report = {
  schema_version: 1,
  artifact_type: 'skill-usage-report',
  basis: 'Lower bound. Only tool-call inputs are scanned. A Skill loaded some other way, or followed from memory, is invisible, so zero observed use is not proof of non-use or non-compliance.',
  since: since === null ? null : new Date(since).toISOString().slice(0, 10),
  coverage,
  skills: rows,
  installed_count: skillRoots.length ? installed.size : null,
  installed_never_observed: skillRoots.length ? [...installed.keys()].filter((name) => !observed.has(name)).sort() : null,
  observed_not_installed: skillRoots.length ? [...observed].filter((name) => !installed.has(name)).sort() : null,
};

function toMarkdown(data) {
  const lines = [
    '# Skill usage report',
    '',
    `Basis: ${data.basis}`,
    `Files scanned: ${data.coverage.files}; with Skill use: ${data.coverage.sessions_with_skill_use}; parse errors: ${data.coverage.parse_errors}; skipped (too large): ${data.coverage.files_skipped_too_large}`,
    '',
    '| Skill | Skill tool | Read SKILL.md | Path mention | Sessions | Last seen |',
    '|---|---:|---:|---:|---:|---|',
    ...data.skills.map((row) => `| ${row.skill} | ${row.skill_tool} | ${row.skill_md_read} | ${row.path_mention} | ${row.sessions} | ${row.last_seen || '-'} |`),
  ];
  if (data.installed_never_observed) {
    lines.push('', `Installed: ${data.installed_count}; never observed: ${data.installed_never_observed.length}`);
    lines.push('', 'Never observed (review as routing candidates, not as proof of dead Skills):', '', data.installed_never_observed.join(', ') || '-');
    lines.push('', 'Observed but not in the supplied roots (plugin, project, or renamed):', '', data.observed_not_installed.join(', ') || '-');
  }
  return lines.join('\n') + '\n';
}

const text = format === 'json' ? JSON.stringify(report, null, 2) + '\n' : toMarkdown(report);
if (output) fs.writeFileSync(output, text, 'utf8');
else process.stdout.write(text);
