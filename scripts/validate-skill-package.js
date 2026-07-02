#!/usr/bin/env node

/**
 * Portable skill package validator.
 *
 * Checks the parts that matter for public distribution without relying on a
 * private Codex installation.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const skillDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, out);
    else out.push(fullPath);
  }
  return out;
}

function validateSkillMd() {
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    fail('Missing SKILL.md');
    return;
  }
  const content = read(skillMd);
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    fail('SKILL.md must start with YAML frontmatter');
    return;
  }
  if (!/^name:\s*[a-z0-9][a-z0-9-]*\s*$/m.test(match[1])) {
    fail('Frontmatter must include a lowercase hyphen-case name');
  }
  if (!/^description:\s*\S+/m.test(match[1])) {
    fail('Frontmatter must include description');
  }
  if (content.length > 15000) {
    warn('SKILL.md is large; consider moving details to references/');
  }
}

function validatePortablePaths() {
  const files = walk(skillDir).filter((file) => /\.(md|js|ts|json|yaml|yml|txt)$/i.test(file));
  const userSegment = '[^\\\\\\s`]+';
  const posixUserSegment = '[^/\\s`]+';
  const privatePatterns = [
    new RegExp(`C:${String.raw`\\`}Users${String.raw`\\`}${userSegment}`, 'i'),
    new RegExp(`/Users/${posixUserSegment}`, 'i'),
    new RegExp(`/home/${posixUserSegment}`, 'i'),
    new RegExp(['d', 'e', 's', 'r', 'e'].join(''), 'i'),
  ];
  const exampleWindowsPlaceholder = new RegExp(`C:${String.raw`\\`}Users${String.raw`\\`}<you>`, 'i');

  for (const file of files) {
    if (path.basename(file) === 'validate-skill-package.js') continue;
    const content = read(file);
    const rel = path.relative(skillDir, file);
    for (const pattern of privatePatterns) {
      if (pattern.test(content) && !exampleWindowsPlaceholder.test(content)) {
        fail(`Private or machine-specific path found in ${rel}`);
        break;
      }
    }
  }
}

function validateScripts() {
  const scriptsDir = path.join(skillDir, 'scripts');
  if (!fs.existsSync(scriptsDir)) return;
  for (const file of walk(scriptsDir)) {
    if (!file.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      fail(`JavaScript syntax check failed for ${path.relative(skillDir, file)}: ${result.stderr || result.stdout}`);
    }
  }
}

function validateReadme() {
  const readme = path.join(skillDir, 'README.md');
  if (!fs.existsSync(readme)) {
    warn('No README.md found; public packages usually need one');
    return;
  }
  const content = read(readme);
  if (!/install/i.test(content)) warn('README.md does not mention install');
  if (!/validate/i.test(content)) warn('README.md does not mention validation');
}

validateSkillMd();
validatePortablePaths();
validateScripts();
validateReadme();

for (const item of warnings) console.warn(`warning: ${item}`);
for (const item of errors) console.error(`error: ${item}`);

if (errors.length) process.exit(1);
console.log(`Skill package is valid: ${skillDir}`);
