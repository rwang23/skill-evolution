#!/usr/bin/env node

/**
 * Extract readable evidence from agent session files.
 *
 * Usage:
 *   node scripts/extract-session.js [session-path]
 *   node scripts/extract-session.js export.jsonl --agent codex
 *   node scripts/extract-session.js --session-dir ~/path/to/sessions --query evidence
 *   node scripts/extract-session.js session.jsonl --format json --include-tool-output
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let sessionPath = null;
let sessionDir = null;
let agent = null;
let cwd = process.cwd();
let cwdSupplied = false;
let query = null;
let maxMessages = 100;
let includeToolOutput = false;
let format = 'markdown';
const maxInputBytes = 32 * 1024 * 1024;
const coverage = { parse_errors: 0, context_messages_excluded: 0, mirrored_messages_removed: 0 };
let sourceLine = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    console.log('Usage: node extract-session.js <session-file> [--agent codex] [--format json] [--include-tool-output] [--query text] [--max-messages count]\nOr: --session-dir <directory> [--cwd <project>]');
    process.exit(0);
  } else if (arg === '--agent' && args[i + 1]) {
    agent = args[++i].toLowerCase();
  } else if (arg === '--cwd' && args[i + 1]) {
    cwd = args[++i];
    cwdSupplied = true;
  } else if (arg === '--session-dir' && args[i + 1]) {
    sessionDir = args[++i];
  } else if (arg === '--query' && args[i + 1]) {
    query = args[++i].toLowerCase();
  } else if (arg === '--max-messages' && args[i + 1]) {
    maxMessages = Number(args[++i]);
  } else if (arg === '--format' && args[i + 1]) {
    format = args[++i].toLowerCase();
  } else if (arg === '--include-tool-output') {
    includeToolOutput = true;
  } else if (!arg.startsWith('-')) {
    sessionPath = arg;
  } else {
    console.error('Unknown option or missing option value.');
    process.exit(1);
  }
}

function normalizeCwd(value) {
  if (!value) return '';
  return path.resolve(value.replace(/^\\\\\?\\/, '')).toLowerCase();
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

function readJsonlPrefix(filePath, limit = 30) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(64 * 1024);
    const length = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    return buffer.toString('utf8', 0, length).split(/\r?\n/).filter(Boolean).slice(0, limit);
  } catch {
    return [];
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
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

function findBySessionDir(dir, targetCwd) {
  const target = normalizeCwd(targetCwd);
  const sessions = walkSessionFiles(dir).sort((a, b) => b.mtime - a.mtime);
  if (!target) return sessions[0]?.path || null;

  for (const session of sessions) {
    const sessionCwd = genericSessionCwd(session.path);
    if (normalizeCwd(sessionCwd) === target) return session.path;
  }
  return null;
}

function inferAgent(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.includes(`${path.sep}.codex${path.sep}`)) return 'codex';
  if (lower.includes(`${path.sep}.claude${path.sep}`)) return 'claude';
  if (lower.includes(`${path.sep}.pi${path.sep}`)) return 'pi';
  if (lower.includes(`${path.sep}.hermes${path.sep}`)) return 'hermes';
  if (lower.includes('antigravity')) return 'antigravity';
  for (const line of readJsonlPrefix(filePath)) {
    try {
      const entry = JSON.parse(line);
      if (['session_meta', 'response_item', 'event_msg'].includes(entry.type)) return 'codex';
    } catch {
      // A partial record is reported during parsing, not used for detection.
    }
  }
  return 'generic';
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
  const text = String(content);
  if (role === 'user' && /^\s*(?:# AGENTS\.md instructions\b|<INSTRUCTIONS>|<skill>|<skills_instructions>|<environment_context>|<external_codex_apps_open_page>)/i.test(text)) {
    coverage.context_messages_excluded += 1;
    return;
  }
  messages.push({ role, content: text, timestamp, kind, source_line: sourceLine });
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
    pushMessage(messages, 'tool_call', `[${name}]\n${toolArgs}`, entry.timestamp, payload.type);
  } else if (includeToolOutput && ['function_call_output', 'custom_tool_call_output'].includes(payload.type)) {
    pushMessage(messages, 'tool_output', textFromContent(payload.output || ''), entry.timestamp, payload.type);
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
    pushMessage(messages, 'tool', JSON.stringify(entry), entry.timestamp || entry.created_at, entry.type);
  }
}

function parseJsonl(content, parserName) {
  const messages = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    sourceLine = index + 1;
    try {
      const entry = JSON.parse(line);
      if (parserName === 'codex') parseCodexEntry(entry, messages);
      else parseGenericEntry(entry, messages);
    } catch {
      coverage.parse_errors += 1;
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
    coverage.parse_errors += 1;
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
  const size = fs.statSync(filePath).size;
  if (size > maxInputBytes) throw new Error('Transcript exceeds the 32 MiB size limit; supply a smaller, explicitly scoped export.');
  coverage.input_bytes = size;
  const content = fs.readFileSync(filePath, 'utf8');
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) return parseJsonl(content, parserName);
  if (lower.endsWith('.json')) return parseJson(content);
  return parsePlainText(content);
}

function resolveSession() {
  if (sessionPath) {
    if (!fs.existsSync(sessionPath)) throw new Error(`Session file not found: ${sessionPath}`);
    return { agent: agent || inferAgent(sessionPath), path: path.resolve(sessionPath) };
  }

  if (sessionDir) {
    const found = findBySessionDir(sessionDir, cwdSupplied ? cwd : null);
    if (!found) throw new Error(`No session file matching the requested cwd under: ${sessionDir}`);
    return { agent: agent || inferAgent(found), path: found };
  }

  throw new Error('Provide an explicit session file or --session-dir; implicit private-history discovery is disabled.');
}

function removeMirrors(messages) {
  const result = [];
  const pending = new Map();
  for (const message of messages) {
    if (!['user', 'assistant'].includes(message.role)) {
      result.push(message);
      continue;
    }
    const key = `${message.role}:${message.content}`;
    const previous = pending.get(key);
    const opposite = previous && previous.message.kind.startsWith('event:') !== message.kind.startsWith('event:');
    const elapsed = previous ? Math.abs(Date.parse(message.timestamp) - Date.parse(previous.message.timestamp)) : NaN;
    if (opposite && message.source_line - previous.message.source_line <= 8 && elapsed <= 5000) {
      // Retain the actual response item and never merge two genuine user turns.
      if (previous.message.kind.startsWith('event:')) result[previous.index] = message;
      pending.delete(key);
      coverage.mirrored_messages_removed += 1;
      continue;
    }
    pending.set(key, { message, index: result.length });
    result.push(message);
  }
  return result;
}

function filterMessages(messages) {
  let filtered = messages;
  if (query) {
    filtered = filtered.filter((msg) => msg.content.toLowerCase().includes(query));
  }
  coverage.query_filtered_messages = messages.length - filtered.length;
  coverage.truncated_messages = Math.max(0, filtered.length - maxMessages);
  coverage.complete = !coverage.parse_errors && !coverage.query_filtered_messages && !coverage.truncated_messages;
  return filtered.slice(-maxMessages);
}

function formatTranscript(result, messages, totalCount) {
  if (format === 'json') {
    return JSON.stringify({ ...result, messages, totalCount, shown: messages.length, coverage }, null, 2);
  }

  const lines = [
    '# Session Transcript',
    `Agent: ${result.agent}`,
    `File: ${result.path}`,
    `Messages: ${totalCount}`,
    `Shown: ${messages.length}`,
    `Coverage: ${JSON.stringify(coverage)}`,
    '',
  ];

  for (const msg of messages) {
    const label = msg.kind === 'message' ? msg.role : `${msg.role} ${msg.kind}`;
    lines.push(`\n### ${label.toUpperCase()} ${msg.timestamp || ''} (line ${msg.source_line || 'unknown'})\n`);
    lines.push(msg.content);
  }

  return lines.join('\n');
}

function main() {
  if (!Number.isSafeInteger(maxMessages) || maxMessages < 1) {
    throw new Error('--max-messages must be a positive integer');
  }
  if (!['markdown', 'json'].includes(format)) {
    throw new Error('--format must be markdown or json');
  }

  const result = resolveSession();
  const parserName = result.agent === 'codex' ? 'codex' : 'generic';
  const parsed = parseSession(result.path, parserName);
  const messages = parserName === 'codex' ? removeMirrors(parsed) : parsed;
  const shown = filterMessages(messages);
  console.log(formatTranscript(result, shown, messages.length));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
