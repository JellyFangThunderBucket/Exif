import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { buildExifArgs, buildExplorerArgs, ensureTempRoot, isAllowedMime, parseExplorerJson, randomId, resolveTemp, runExiftool, safeBasename, presets } from './exiftool.js';
import { buildInvestigationReport, capabilitiesForFile, detectMagic, extractPrintableStrings, getToolAvailability, hashFile, parseQrOutput, stringLengthAllowlist, validateOcrLanguage, validateTimestamp, verifyHash } from './tools.js';

const rates = new Map();
function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); }
function publicError(e) { return /ENOENT/.test(e.message) ? 'ExifTool is not installed or not available.' : e.message.replaceAll(config.tempRoot, '[temporary directory]'); }
async function body(req) { const a = []; let size = 0; for await (const c of req) { a.push(c); size += c.length; if (size > config.maxUploadBytes + 1e6) throw Error('Upload too large.'); } return Buffer.concat(a); }
async function parseMultipart(req) {
  const ct = req.headers['content-type'] || '';
  const m = ct.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
  if (!m) throw Error('Multipart form data is required.');
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
  const data = await body(req);
  const startBoundary = data.indexOf(boundary);
  if (startBoundary < 0) throw Error('Multipart upload could not be parsed.');
  const start = startBoundary + boundary.length + 2;
  const end = data.indexOf(Buffer.concat([Buffer.from('\r\n'), boundary]), start);
  if (end < 0) throw Error('Multipart upload could not be parsed.');
  const part = data.subarray(start, end);
  const headEnd = part.indexOf('\r\n\r\n');
  if (headEnd < 0) throw Error('Multipart upload could not be parsed.');
  const head = part.subarray(0, headEnd).toString();
  const content = part.subarray(headEnd + 4);
  const filename = (head.match(/filename="([^"]*)"/) || [])[1] || 'upload';
  const type = (head.match(/Content-Type: ([^\r\n]+)/i) || [])[1] || 'application/octet-stream';
  return { filename, type, content };
}
function rate(req, res) { const ip = req.socket.remoteAddress, now = Date.now(), r = rates.get(ip) || { n: 0, t: now }; if (now - r.t > config.rateLimitWindowMs) { r.n = 0; r.t = now; } r.n++; rates.set(ip, r); if (r.n > config.rateLimitMax) { json(res, 429, { error: 'Too many requests.' }); return true; } }
async function handler(req, res) {
  try {
    if (rate(req, res)) return;
    await ensureTempRoot();
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { maxUploadBytes: config.maxUploadBytes, presets, stringLengthAllowlist });
    if (req.method === 'GET' && url.pathname === '/api/tools') return json(res, 200, { tools: await getToolAvailability() });
    if (req.method === 'GET' && url.pathname === '/api/about') { let exiftoolVersion = 'Unavailable'; try { const v = await runExiftool(['-ver'], 5000); if (v.code === 0) exiftoolVersion = v.stdout.trim() || 'Unavailable'; } catch {} return json(res, 200, { name: 'Metadata Lab', version: '1.0.0', exiftoolVersion }); }
    if (req.method === 'POST' && url.pathname === '/api/upload') { const f = await parseMultipart(req); if (!isAllowedMime(f.type)) return json(res, 400, { error: 'Unsupported file type.' }); if (!f.content.length) return json(res, 400, { error: 'Uploaded file is empty.' }); if (f.content.length > config.maxUploadBytes) return json(res, 413, { error: 'Upload exceeds configured size limit.' }); const fileId = randomId(), storedName = `${randomId()}-${safeBasename(f.filename)}`, dir = resolveTemp(fileId); await fs.mkdir(dir, { recursive: true, mode: 0o700 }); await fs.writeFile(resolveTemp(fileId, storedName), f.content, { mode: 0o600 }); const magic = await detectMagic(resolveTemp(fileId, storedName), f.type); return json(res, 200, { fileId, filename: f.filename, storedName, type: f.type, detectedMime: magic.detectedMime, magicTrusted: magic.trusted, size: f.content.length, capabilities: capabilitiesForFile({ type: f.type, detectedMime: magic.detectedMime }) }); }
    if (req.method === 'POST' && (url.pathname === '/api/command' || url.pathname === '/api/run')) { const p = JSON.parse((await body(req)).toString() || '{}'); const fileId = path.basename(p.fileId || ''), storedName = path.basename(p.storedName || ''); const inputPath = resolveTemp(fileId, storedName); const st = await fs.stat(inputPath).catch(() => null); if (!st) return json(res, 400, { error: 'Uploaded file was not found or expired.' }); const outputName = `out-${randomId()}-${storedName}`, outputPath = resolveTemp(fileId, outputName); const built = buildExifArgs({ ...p, inputPath, outputPath }); if (url.pathname === '/api/command') return json(res, 200, built); const result = await runExiftool(built.args); const exists = await fs.stat(outputPath).then(s => s.isFile()).catch(() => false); let explorer = null; if (!built.modifies) { const explorerCommand = buildExplorerArgs(inputPath); try { const explorerResult = await runExiftool(explorerCommand.args); explorer = { ...parseExplorerJson(explorerResult.stdout), command: explorerCommand.command, args: explorerCommand.args, explanations: explorerCommand.explanations, error: explorerResult.code === 0 ? null : explorerResult.stderr }; } catch (error) { explorer = { rows: [], groups: {}, stats: { totalTags: 0, totalGroups: 0, duplicateTagCount: 0, gpsGroups: 0, dateTimeGroups: 0, embeddedImageGroups: 0 }, findings: [], command: explorerCommand.command, args: explorerCommand.args, explanations: explorerCommand.explanations, error: publicError(error) }; } } return json(res, 200, { ...built, ...result, download: exists ? `/api/download/${fileId}/${outputName}` : null, organized: organize(result.stdout), explorer }); }

    if (req.method === 'POST' && url.pathname === '/api/investigate') { const p = JSON.parse((await body(req)).toString() || '{}'); const fileId = path.basename(p.fileId || ''), storedName = path.basename(p.storedName || ''); const inputPath = resolveTemp(fileId, storedName); const st = await fs.stat(inputPath).catch(() => null); if (!st) return json(res, 400, { error: 'Uploaded file was not found or expired.' }); const file = { ...p, fileId, storedName, size: st.size }; const availability = await getToolAvailability(); const requested = Array.isArray(p.analyses) ? p.analyses : ['hashes', 'strings']; const completed = [], failed = [], commands = []; const result = { capabilities: capabilitiesForFile(file, availability), availability }; if (requested.includes('hashes')) { try { result.hashes = await hashFile(inputPath); completed.push('hashes'); } catch (e) { failed.push({ id: 'hashes', error: publicError(e) }); } } if (requested.includes('strings')) { try { const min = Number(p.minLength || 6); result.strings = extractPrintableStrings(await fs.readFile(inputPath), min); commands.push(`strings -n ${min} ${path.basename(storedName)}`); completed.push('strings'); } catch (e) { failed.push({ id: 'strings', error: publicError(e) }); } } result.report = await buildInvestigationReport({ file, hashes: result.hashes, completed, failed, availability, commands }); result.completed = completed; result.failed = failed; return json(res, 200, result); }
    if (req.method === 'POST' && url.pathname === '/api/verify-hash') { const p = JSON.parse((await body(req)).toString() || '{}'); return json(res, 200, { result: verifyHash(p.actual, p.expected) }); }
    if (req.method === 'POST' && url.pathname === '/api/validate-ocr-language') { const p = JSON.parse((await body(req)).toString() || '{}'); return json(res, 200, { language: validateOcrLanguage(p.language || 'eng') }); }
    if (req.method === 'POST' && url.pathname === '/api/validate-timestamp') { const p = JSON.parse((await body(req)).toString() || '{}'); return json(res, 200, { timestamp: validateTimestamp(p.timestamp) }); }
    if (req.method === 'POST' && url.pathname === '/api/panic') { await fs.rm(config.tempRoot, { recursive: true, force: true }); await ensureTempRoot(); return json(res, 200, { ok: true }); }
    if (req.method === 'GET' && url.pathname.startsWith('/api/download/')) { const [, , , fid, ...nm] = url.pathname.split('/'); const filename = path.basename(nm.join('/')); const p = resolveTemp(path.basename(fid), filename); const st = await fs.stat(p).catch(() => null); if (!st?.isFile()) return json(res, 404, { error: 'Download file was not found or expired.' }); res.writeHead(200, { 'content-disposition': 'attachment; filename="' + filename.replaceAll('"', '') + '"' }); return fss.createReadStream(p).pipe(res); }
    const file = url.pathname === '/' ? '/index.html' : url.pathname; const p = path.resolve('public', file.slice(1)); if (!p.startsWith(path.resolve('public'))) return json(res, 404, { error: 'Not found.' }); const data = await fs.readFile(p).catch(() => null); if (!data) return json(res, 404, { error: 'Not found.' }); res.writeHead(200, { 'content-type': mime(p) }); res.end(data);
  } catch (e) { json(res, 400, { error: publicError(e) }); }
}
function organize(stdout) { const groups = {}; for (const line of stdout.split('\n')) { const m = line.match(/^\[([^\]]+)\]\s*([^:]+):\s*(.*)$/) || line.match(/^([^:]+):\s*(.*)$/); if (m) { const g = m.length === 4 ? m[1] : 'General', k = m.length === 4 ? m[2] : m[1], v = m.length === 4 ? m[3] : m[2]; (groups[g] ||= []).push({ key: k.trim(), value: v.trim() }); } } return groups; }
function mime(p) { return p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html'; }
export function createServer() { return http.createServer(handler); }
