import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from './config.js';
import { resolveTemp, safeBasename } from './exiftool.js';

export const outputLimits = { maxExtractedBytes: 25 * 1024 * 1024, maxGeneratedFiles: 8, stringsMaxCount: 500, stringsMaxBytes: 64 * 1024 };
export const ocrLanguages = ['eng'];
export const stringLengthAllowlist = [4, 6, 8, 12];
export const timestampPattern = /^(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?$/;

export const toolRegistry = {
  exiftool: { id: 'exiftool', displayName: 'ExifTool', command: config.exiftoolPath, supportedMimeFamilies: ['image', 'video', 'audio', 'application', 'text'], timeoutMs: 30000, maxOutputBytes: 256000, allowedArgs: ['-ver', '-G1', '-s', '-a', '-json', '-j', '-b', '-thumbnailimage', '-previewimage'], enabledByDefault: true, expensive: false, mayExtractFiles: true, purpose: 'Metadata reading and embedded resource discovery.' },
  mediainfo: { id: 'mediainfo', displayName: 'MediaInfo', command: 'mediainfo', supportedMimeFamilies: ['video', 'audio'], timeoutMs: 15000, maxOutputBytes: 256000, allowedArgs: ['--Output=JSON'], enabledByDefault: true, expensive: false, mayExtractFiles: false, purpose: 'Media container and stream information.' },
  ffprobe: { id: 'ffprobe', displayName: 'FFprobe', command: 'ffprobe', supportedMimeFamilies: ['video', 'audio'], timeoutMs: 15000, maxOutputBytes: 256000, allowedArgs: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams'], enabledByDefault: true, expensive: false, mayExtractFiles: false, purpose: 'Media stream and codec summary.' },
  identify: { id: 'identify', displayName: 'ImageMagick identify', command: 'identify', supportedMimeFamilies: ['image'], timeoutMs: 15000, maxOutputBytes: 128000, allowedArgs: ['-verbose'], enabledByDefault: true, expensive: false, mayExtractFiles: false, purpose: 'Image dimensions, format, color, and profile properties.' },
  strings: { id: 'strings', displayName: 'strings', command: 'strings', supportedMimeFamilies: ['image', 'video', 'audio', 'application', 'text'], timeoutMs: 10000, maxOutputBytes: outputLimits.stringsMaxBytes, allowedArgs: ['-n'], enabledByDefault: true, expensive: false, mayExtractFiles: false, purpose: 'Printable byte sequence discovery with capped output.' },
  hash: { id: 'hash', displayName: 'Node crypto hashes', command: 'node:crypto', supportedMimeFamilies: ['image', 'video', 'audio', 'application', 'text'], timeoutMs: 5000, maxOutputBytes: 4096, allowedArgs: [], enabledByDefault: true, expensive: false, mayExtractFiles: false, purpose: 'SHA-256 and MD5 file comparison hashes.' },
  zbarimg: { id: 'zbarimg', displayName: 'zbarimg', command: 'zbarimg', supportedMimeFamilies: ['image'], timeoutMs: 15000, maxOutputBytes: 64000, allowedArgs: ['--quiet'], enabledByDefault: true, expensive: false, mayExtractFiles: false, purpose: 'QR and barcode detection.' },
  tesseract: { id: 'tesseract', displayName: 'Tesseract OCR', command: 'tesseract', supportedMimeFamilies: ['image'], timeoutMs: 30000, maxOutputBytes: 128000, allowedArgs: ['stdout', '-l'], enabledByDefault: false, expensive: true, mayExtractFiles: true, purpose: 'Explicit OCR text extraction.' },
  binwalk: { id: 'binwalk', displayName: 'binwalk', command: 'binwalk', supportedMimeFamilies: ['image', 'video', 'audio', 'application'], timeoutMs: 20000, maxOutputBytes: 128000, allowedArgs: [], enabledByDefault: false, expensive: true, mayExtractFiles: false, purpose: 'Read-only binary signature scan; no extraction.' },
  ffmpeg: { id: 'ffmpeg', displayName: 'FFmpeg', command: 'ffmpeg', supportedMimeFamilies: ['video'], timeoutMs: 30000, maxOutputBytes: 64000, allowedArgs: ['-y', '-ss', '-i', '-frames:v', '1'], enabledByDefault: false, expensive: true, mayExtractFiles: true, purpose: 'Explicit video frame extraction to a private output file.' },
};

const availabilityCache = { t: 0, data: null };
const running = new Map();
const cancelled = new Set();
let activeProcesses = 0;
const maxConcurrent = 2;

export function familyFromMime(mime = '') { return String(mime).split('/')[0] || 'application'; }
export function toolApplies(tool, mime = '') { return tool.supportedMimeFamilies.includes(familyFromMime(mime)) || tool.supportedMimeFamilies.includes(String(mime)); }
export function sanitizeError(error) { return String(error?.message || error || 'Tool failed.').replaceAll(config.tempRoot, '[temporary directory]'); }
export function validateAllowedArgs(toolId, args = []) { const tool = toolRegistry[toolId]; if (!tool) throw new Error('Unknown tool.'); for (const arg of args) if (String(arg).startsWith('-') && !tool.allowedArgs.includes(arg)) throw new Error(`Argument is not allowed for ${tool.displayName}: ${arg}`); return true; }
export function buildCommand(toolId, args = []) { validateAllowedArgs(toolId, args); const tool = toolRegistry[toolId]; return { command: [tool.command, ...args.map(a => String(a).includes(' ') ? JSON.stringify(String(a)) : String(a))].join(' '), explanations: (args || []).filter(a => String(a).startsWith('-')).map(flag => ({ flag, explanation: explainArg(toolId, flag) })) }; }
export function explainArg(toolId, flag) { return ({ '-n': 'Sets the minimum printable string length from the server allowlist.', '--Output=JSON': 'Requests structured JSON output.', '-print_format': 'Selects JSON output formatting.', '-show_format': 'Shows container-level media information.', '-show_streams': 'Shows stream-level codec information.', '-verbose': 'Shows detailed image properties.', '--quiet': 'Suppresses extra scanner chatter.', '-l': 'Selects an OCR language from the server allowlist.', '-ss': 'Seeks to a validated timestamp.', '-frames:v': 'Limits extraction to one video frame.' }[flag] || `Allowed ${toolRegistry[toolId]?.displayName || 'tool'} option.`); }

export async function detectMagic(filePath, browserMime = '') {
  const fd = await fs.open(filePath, 'r');
  const buf = Buffer.alloc(16); await fd.read(buf, 0, 16, 0); await fd.close();
  let detected = browserMime || 'application/octet-stream';
  if (buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) detected = 'image/jpeg';
  else if (buf.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) detected = 'image/png';
  else if (buf.subarray(0, 4).toString() === '%PDF') detected = 'application/pdf';
  else if (buf.subarray(4, 8).toString() === 'ftyp') detected = 'video/mp4';
  else if (buf.subarray(0, 3).toString() === 'ID3') detected = 'audio/mpeg';
  return { browserMime, detectedMime: detected, trusted: !browserMime || browserMime === detected || browserMime.startsWith(familyFromMime(detected) + '/') };
}

export async function getToolAvailability(force = false) { if (!force && availabilityCache.data && Date.now() - availabilityCache.t < 60000) return availabilityCache.data; const data = {}; await Promise.all(Object.values(toolRegistry).map(async tool => { if (tool.command === 'node:crypto') { data[tool.id] = { ...publicTool(tool), installed: true, version: process.version }; return; } try { const flag = tool.id === 'ffprobe' || tool.id === 'ffmpeg' ? ['-version'] : tool.id === 'identify' ? ['-version'] : tool.id === 'tesseract' ? ['--version'] : tool.id === 'binwalk' ? ['--version'] : ['--version']; const r = await safeRunTool(tool.id, flag, { timeoutMs: 2500, maxOutputBytes: 4096, allowVersionArgs: true }); data[tool.id] = { ...publicTool(tool), installed: true, version: firstLine(r.stdout || r.stderr) }; } catch (e) { data[tool.id] = { ...publicTool(tool), installed: false, version: 'Unavailable', error: sanitizeError(e) }; } })); availabilityCache.t = Date.now(); availabilityCache.data = data; return data; }
function publicTool(tool) { const { command, allowedArgs, ...rest } = tool; return rest; }
function firstLine(s = '') { return String(s).split('\n').find(Boolean)?.slice(0, 160) || 'Installed'; }

export function safeRunTool(toolId, args = [], opts = {}) { const tool = toolRegistry[toolId]; if (!tool) return Promise.reject(new Error('Executable is not allowlisted.')); const versionArgs = ['--version', '-version']; if (!opts.allowVersionArgs || !args.every(a => versionArgs.includes(a))) validateAllowedArgs(toolId, args); const timeoutMs = opts.timeoutMs || tool.timeoutMs; const maxOutputBytes = opts.maxOutputBytes || tool.maxOutputBytes; const id = opts.taskId || crypto.randomUUID(); return new Promise((resolve, reject) => { if (activeProcesses >= maxConcurrent) return reject(new Error('Too many analyses are already running.')); activeProcesses++; const child = spawn(tool.command, args, { shell: false, windowsHide: true, cwd: opts.cwd || config.tempRoot, env: { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8' } }); let stdout = '', stderr = '', capped = false; const finish = (fn, val) => { activeProcesses--; running.delete(id); fn(val); }; const cap = (name, data) => { const next = (name === 'stdout' ? stdout : stderr) + data; if (Buffer.byteLength(next) > maxOutputBytes) { capped = true; child.kill('SIGKILL'); } else if (name === 'stdout') stdout = next; else stderr = next; }; const timer = setTimeout(() => { child.kill('SIGKILL'); finish(reject, new Error(`${tool.displayName} timed out.`)); }, timeoutMs); running.set(id, child); child.stdout.on('data', d => cap('stdout', d)); child.stderr.on('data', d => cap('stderr', d)); child.on('error', e => { clearTimeout(timer); finish(reject, e); }); child.on('close', code => { clearTimeout(timer); if (cancelled.delete(id)) return finish(reject, new Error(`${tool.displayName} cancelled.`)); if (capped) return finish(reject, new Error(`${tool.displayName} output limit exceeded.`)); finish(resolve, { taskId: id, code, stdout, stderr, command: [tool.command, ...args].join(' ') }); }); }); }
export function cancelTask(id) { const child = running.get(id); if (!child) return false; cancelled.add(id); child.kill('SIGKILL'); return true; }

export async function hashFile(filePath) { const data = await fs.readFile(filePath); return { sha256: crypto.createHash('sha256').update(data).digest('hex'), md5: crypto.createHash('md5').update(data).digest('hex') }; }
export function verifyHash(actual, expected = '') { const clean = String(expected).trim().toLowerCase(); if (!clean) return 'empty'; return String(actual).toLowerCase() === clean ? 'match' : 'mismatch'; }
export function extractPrintableStrings(buffer, minLength = 6, limit = outputLimits.stringsMaxCount) { if (!stringLengthAllowlist.includes(Number(minLength))) throw new Error('Minimum string length is not allowed.'); const text = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer); const re = new RegExp(`[\\x20-\\x7E]{${minLength},}`, 'g'); return [...text.matchAll(re)].slice(0, limit).map((m, i) => ({ line: i + 1, value: m[0].slice(0, 500) })); }
export function validateOcrLanguage(lang = 'eng') { if (!ocrLanguages.includes(lang)) throw new Error('OCR language is not allowed.'); return lang; }
export function validateTimestamp(ts) { if (!timestampPattern.test(String(ts))) throw new Error('Timestamp format is not allowed.'); return String(ts); }
export function frameOutputPath(fileId, name = 'frame.jpg') { return resolveTemp(path.basename(fileId), `frame-${Date.now()}-${safeBasename(name)}`); }
export function embeddedOutputPath(fileId, name = 'embedded.bin') { return resolveTemp(path.basename(fileId), `embedded-${Date.now()}-${safeBasename(name)}`); }
export function buildBinwalkArgs() { return []; }
export function parseQrOutput(raw = '') { return String(raw).split('\n').filter(Boolean).slice(0, 50).map(line => { const i = line.indexOf(':'); const symbology = i > -1 ? line.slice(0, i) : 'UNKNOWN'; const value = i > -1 ? line.slice(i + 1) : line; let url = null; try { const u = new URL(value); if (['http:', 'https:'].includes(u.protocol)) url = u.href; } catch {} return { symbology, value, url }; }); }
export function capabilitiesForFile(file = {}, availability = {}) { const mime = file.detectedMime || file.type || ''; const family = familyFromMime(mime); const caps = [
  ['metadata', 'Metadata', true, 'ExifTool read-only metadata.'], ['media', 'Media information', ['video','audio'].includes(family), 'Requires audio/video media and MediaInfo or FFprobe.'], ['hashes', 'Hashes', true, 'Node crypto SHA-256 and MD5.'], ['strings', 'Strings', true, 'Capped printable strings scan.'], ['ocr', 'OCR', family === 'image', 'Explicit image OCR only.'], ['qr', 'QR/barcode scan', family === 'image', 'Image QR/barcode scan.'], ['embedded', 'Embedded images', ['image','audio','video'].includes(family), 'ExifTool resource discovery.'], ['frames', 'Frame extraction', family === 'video', 'Explicit FFmpeg frame extraction.'], ['image', 'Image properties', family === 'image', 'ImageMagick identify.'], ['binary', 'Binary structure', true, 'Read-only binwalk signature scan.'],
]; return caps.map(([id, label, applicable, reason]) => ({ id, label, applicable: Boolean(applicable), enabled: Boolean(applicable), reason: applicable ? 'Available for this file.' : reason })); }
export async function buildInvestigationReport({ file, hashes = null, completed = [], failed = [], availability = {}, commands = [] }) { return { filename: file.filename, mimeType: file.detectedMime || file.type, extension: path.extname(file.filename || '').slice(1), size: file.size, hashes, toolAvailability: Object.fromEntries(Object.entries(availability).map(([k, v]) => [k, { installed: v.installed, version: v.version }])), completedAnalyses: completed, failedAnalyses: failed, generatedCommands: commands, sessionTimestamp: new Date().toISOString() }; }
