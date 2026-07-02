#!/usr/bin/env node

/**
 * Extract readable evidence from agent session files.
 *
 * Usage:
 *   node scripts/extract-session.js [session-path]
 *   node scripts/extract-session.js --agent codex --cwd "$PWD"
 *   node scripts/extract-session.js --session-dir ~/path/to/sessions --query evidence
 *   node scripts/extract-session.js session.jsonl --format json --include-tool-output
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
let sessionPath = null;
let sessionDir = null;
let agent = null;
let cwd = process.cwd();
let query = null;
let maxMessages = 100;
let includeToolOutput = false;
let format = 'markdown';

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--agent' && args[i + 1]) {
    agent = args[++i].toLowerCase();
  } else if (arg === '--cwd' && args[i + 1]) {
    cwd = args[++i];
  } else if (arg === '--session-dir' && args[i + 1]) {
    sessionDir = args[++i];
  } else if (arg === '--query' && args[i + 1]) {
    query = args[++i].toLowerCase();
  } else if (arg === '--max-messages' && args[i + 1]) {
    maxMessages = Number.parseInt(args[++i], 10);
  } else if (arg === '--format' && args[i + 1]) {
    format = args[++i].toLowerCase();
  } else if (arg === '--include-tool-output') {
    includeToolOutput = true;
  } else if (!arg.startsWith('-')) {
    sessionPath = arg;
  }
}

function normalizeCwd(value) {
  if (!value) return '';
  return path.resolve(value.replace(/^\\\\\?\\/, '')).toLowerCase();
}

function encodeCwd(value, style) {
  const normalized = value.replace(/^\\\\\?\\/, '');
  if (style === 'pi') {
    return `--${normalized.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`;
  }
  return normalized.replace(/\//g, '-').replace(/\\/g, '-').replace(/:/g, '');
}

function statFile(fullPath) {
  try {
    const stat = fs.statSync(fullPath);
    return stat.isFile() ? stat.mtimeMs : null;
  } catch {
    return null;
  }
}

function walkSessionFiles(dir, out = []) {
  if (!dir || !fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSessionFiles(fullPath, out);
    } else if (/\.(jsonl|json|ndjson|md|txt)$/i.test(entry.name)) {
      const mtime = statFile(fullPath);
      if (mtime !== null) out.push({ path: fullPath, mtime });
    }
  }
  return out;
}

function findMostRecentSession(dir) {
  return walkSessionFiles(dir).sort((a, b) => b.mtime - a.mtime)[0]?.path || null;
}

function readJsonlPrefix(filePath, limit = 30) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).slice(0, limit);
  } catch {
    return [];
  }
}

function codexSessionCwd(filePath) {
  for (const line of readJsonlPrefix(filePath)) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'session_meta' && entry.payload?.cwd) return entry.payload.cwd;
      if (entry.type === 'turn_context' && entry.payload?.cwd) return entry.payload.cwd;
    } catch {
      return null;
    }
  }
  return null;
}

function genericSessionCwd(filePath) {
  for (const line of readJsonlPrefix(filePath)) {
    try {
      const entry = JSON.parse(line);
      const value = entry.cwd || entry.project_cwd || entry.session?.cwd || entry.payload?.cwd;
      if (value) return value;
    } catch {
      return null;
    }
  }
  return null;
}

function findCodexSession(targetCwd) {
  const baseDir = path.join(os.homedir(), '.codex', 'sessions');
  const target = normalizeCwd(targetCwd);
  const sessions = walkSessionFiles(baseDir).filter((item) => item.path.endsWith('.jsonl')).sort((a, b) => b.mtime - a.mtime);

  for (const session of sessions) {
    const sessionCwd = codexSessionCwd(session.path);
    if (normalizeCwd(sessionCwd) === target) return session.path;
  }
  return null;
}

function findBySessionDir(dir, targetCwd) {
  const target = normalizeCwd(targetCwd);
  const sessions = walkSessionFiles(dir).sort((a, b) => b.mtime - a.mtime);
  if (!target) return sessions[0]?.path || null;

  for (const session of sessions) {
    const sessionCwd = genericSessionCwd(session.path);
    if (normalizeCwd(sessionCwd) === target) return session.path;
  }
  return sessions[0]?.path || null;
}

function autoDetectSession(targetCwd) {
  const claudePath = path.join(os.homedir(), '.claude', 'projects', encodeCwd(targetCwd, 'claude'));
  const claudeSession = findMostRecentSession(claudePath);
  if (claudeSession) return { agent: 'claude', path: claudeSession };

  const piPath = path.join(os.homedir(), '.pi', 'agent', 'sessions', encodeCwd(targetCwd, 'pi'));
  const piSession = findMostRecentSession(piPath);
  if (piSession) return { agent: 'pi', path: piSession };

  const codexSession = findCodexSession(targetCwd);
  if (codexSession) return { agent: 'codex', path: codexSession };

  return null;
}

function inferAgent(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.includes(`${path.sep}.codex${path.sep}`)) return 'codex';
  if (lower.includes(`${path.sep}.claude${path.sep}`)) return 'claude';
  if (lower.includes(`${path.sep}.pi${path.sep}`)) return 'pi';
  if (lower.includes(`${path.sep}.hermes${path.sep}`)) return 'hermes';
  if (lower.includes('antigravity')) return 'antigravity';
  return 'generic';
}

function truncate(value, max = 2000) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[... truncated ${text.length - max} chars ...]`;
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content);

  return content.map((item) => {
    if (typeof item === 'string') return item;
    if (item.text) return item.text;
    if (item.input) return JSON.stringify(item.input, null, 2);
    if (item.content) return typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
    return `[${item.type || 'item'}]`;
  }).join('\n');
}

function pushMessage(messages, role, content, timestamp, kind = 'message') {
  if (!content || !String(content).trim()) return;
  messages.push({ role, content: String(content), timestamp, kind });
}

function parseCodexEntry(entry, messages) {
  const payload = entry.payload || {};

  if (entry.type === 'event_msg') {
    if (payload.type === 'user_message') {
      pushMessage(messages, 'user', payload.message, entry.timestamp, 'event:user_message');
    } else if (payload.type === 'agent_message') {
      pushMessage(messages, 'assistant', payload.message, entry.timestamp, 'event:agent_message');
    }
    return true;
  }

  if (entry.type !== 'response_item') return false;

  if (payload.type === 'message' && payload.role) {
    pushMessage(messages, payload.role, textFromContent(payload.content), entry.timestamp);
  } else if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
    const name = payload.name || 'tool';
    const toolArgs = payload.arguments || payload.input || '';
    pushMessage(messages, 'tool_call', `[${name}]\n${truncate(toolArgs, 2000)}`, entry.timestamp, payload.type);
  } else if (includeToolOutput && payload.type === 'function_call_output') {
    pushMessage(messages, 'tool_output', truncate(payload.output || '', 3000), entry.timestamp, payload.type);
  }
  return true;
}

function parseGenericEntry(entry, messages) {
  const message = entry.message || entry.payload?.message || entry.response || entry.request;
  if (message?.role) {
    pushMessage(messages, message.role, textFromContent(message.content || message.text), entry.timestamp || entry.created_at);
    return;
  }

  const role = entry.role || entry.author?.role || entry.payload?.role;
  const content = entry.content || entry.text || entry.message || entry.payload?.content || entry.payload?.text;
  if (role && content) {
    pushMessage(messages, role, textFromContent(content), entry.timestamp || entry.created_at);
    return;
  }

  if (entry.type && entry.type.toLowerCase().includes('tool') && includeToolOutput) {
    pushMessage(messages, 'tool', truncate(JSON.stringify(entry), 3000), entry.timestamp || entry.created_at, entry.type);
  }
}

function parseJsonl(content, parserName) {
  const messages = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (parserName === 'codex') parseCodexEntry(entry, messages);
      else parseGenericEntry(entry, messages);
    } catch {
      // Ignore malformed JSONL lines.
    }
  }
  return messages;
}

function parseJson(content) {
  const messages = [];
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return messages;
  }
  const entries = Array.isArray(parsed) ? parsed : parsed.messages || parsed.items || parsed.conversation || [];
  for (const entry of entries) parseGenericEntry(entry, messages);
  return messages;
}

function parsePlainText(content) {
  return [{ role: 'transcript', content: content.trim(), timestamp: null, kind: 'plain_text' }].filter((msg) => msg.content);
}

function parseSession(filePath, parserName) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) return parseJsonl(content, parserName);
  if (lower.endsWith('.json')) return parseJson(content);
  return parsePlainText(content);
}

function resolveSession() {
  if (sessionPath) {
    if (!fs.existsSync(sessionPath)) throw new Error(`Session file not found: ${sessionPath}`);
    return { agent: agent || inferAgent(sessionPath), path: sessionPath };
  }

  if (sessionDir) {
    const found = findBySessionDir(sessionDir, cwd);
    if (!found) throw new Error(`No session file found under: ${sessionDir}`);
    return { agent: agent || inferAgent(found), path: found };
  }

  if (agent === 'claude') {
    const dir = path.join(os.homedir(), '.claude', 'projects', encodeCwd(cwd, 'claude'));
    const found = findMostRecentSession(dir);
    if (!found) throw new Error(`No Claude Code session found for: ${cwd}`);
    return { agent, path: found };
  }

  if (agent === 'pi') {
    const dir = path.join(os.homedir(), '.pi', 'agent', 'sessions', encodeCwd(cwd, 'pi'));
    const found = findMostRecentSession(dir);
    if (!found) throw new Error(`No Pi session found for: ${cwd}`);
    return { agent, path: found };
  }

  if (agent === 'codex') {
    const found = findCodexSession(cwd);
    if (!found) throw new Error(`No Codex session found for: ${cwd}`);
    return { agent, path: found };
  }

  const detected = autoDetectSession(cwd);
  if (!detected) throw new Error(`No session found for: ${cwd}`);
  return detected;
}

function filterMessages(messages) {
  let filtered = messages;
  if (query) {
    filtered = filtered.filter((msg) => msg.content.toLowerCase().includes(query));
  }
  return filtered.slice(-maxMessages);
}

function formatTranscript(result, messages, totalCount) {
  if (format === 'json') {
    return JSON.stringify({ ...result, messages, totalCount, shown: messages.length }, null, 2);
  }

  const lines = [
    '# Session Transcript',
    `Agent: ${result.agent}`,
    `File: ${result.path}`,
    `Messages: ${totalCount}`,
    `Shown: ${messages.length}`,
    '',
  ];

  for (const msg of messages) {
    const label = msg.kind === 'message' ? msg.role : `${msg.role} ${msg.kind}`;
    lines.push(`\n### ${label.toUpperCase()} ${msg.timestamp || ''}\n`);
    lines.push(msg.content);
  }

  return lines.join('\n');
}

function main() {
  if (!Number.isFinite(maxMessages) || maxMessages < 1) {
    throw new Error('--max-messages must be a positive integer');
  }
  if (!['markdown', 'json'].includes(format)) {
    throw new Error('--format must be markdown or json');
  }

  const result = resolveSession();
  const parserName = result.agent === 'codex' ? 'codex' : 'generic';
  const messages = parseSession(result.path, parserName);
  const shown = filterMessages(messages);
  console.log(formatTranscript(result, shown, messages.length));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
