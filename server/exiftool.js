import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from './config.js';

export const allowedMimePrefixes = ['image/', 'video/', 'audio/'];
export const allowedMimes = new Set(['application/pdf', 'application/zip', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
export const readOnlyFlags = new Set(['-a','-U','-G1','-s','-j','-json','-warning','-validate','-ee','-b','-previewimage','-thumbnailimage','-time:all','-file:all','-composite:all','-gps:all']);
export const writeFlags = new Set(['-all=','-gps:all=','-xmp:geotag=','-overwrite_original_in_place']);
export const allowedTags = new Set(['Title','Description','Artist','Author','Copyright','Keywords','Comment','CreateDate','ModifyDate']);

export const presets = {
  basic: { label: 'Basic inspection', args: ['-G1', '-s'], mode: 'read' },
  maximum: { label: 'Maximum metadata inspection', args: ['-a','-U','-G1','-s'], mode: 'read' },
  json: { label: 'JSON metadata report', args: ['-a','-U','-G1','-j'], mode: 'read' },
  privacy: { label: 'Privacy cleanup', args: ['-all='], mode: 'write' },
  removeGps: { label: 'Remove GPS only', args: ['-gps:all=','-xmp:geotag='], mode: 'write' },
  removeWritable: { label: 'Remove all writable metadata', args: ['-all='], mode: 'write' },
  preserveDates: { label: 'Preserve dates while removing other writable metadata', args: ['-all=','-tagsFromFile','@','-time:all'], mode: 'write' },
  validate: { label: 'Validate file and show warnings', args: ['-validate','-warning','-a','-G1','-s'], mode: 'read' },
  thumbnails: { label: 'Extract embedded thumbnails and previews', args: ['-b','-thumbnailimage','-previewimage'], mode: 'read' },
};

export function isAllowedMime(mime = '') { return allowedMimes.has(mime) || allowedMimePrefixes.some(p => mime.startsWith(p)); }
export function safeBasename(name) { return path.basename(String(name || 'upload')).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'upload'; }
export async function ensureTempRoot() { await fs.mkdir(config.tempRoot, { recursive: true, mode: 0o700 }); }
export function randomId() { return crypto.randomBytes(18).toString('hex'); }
export function resolveTemp(...parts) { const resolved = path.resolve(config.tempRoot, ...parts); if (!resolved.startsWith(config.tempRoot + path.sep) && resolved !== config.tempRoot) throw new Error('Invalid temporary path.'); return resolved; }

export function buildExifArgs({ preset='basic', flags=[], edits={}, inputPath, outputPath }) {
  const p = presets[preset];
  if (!p) throw new Error('Unknown preset.');
  const args = [...p.args];
  for (const flag of flags || []) {
    if (!readOnlyFlags.has(flag) && !writeFlags.has(flag)) throw new Error(`Option is not allowed: ${flag}`);
    args.push(flag);
  }
  for (const [tag, value] of Object.entries(edits || {})) {
    if (!allowedTags.has(tag)) throw new Error(`Tag is not allowed: ${tag}`);
    if (String(value).length > 500) throw new Error(`Value too long for ${tag}.`);
    args.push(`-${tag}=${String(value)}`);
  }
  const modifies = p.mode === 'write' || args.some(a => a.endsWith('=') || /^-[A-Za-z0-9:]+=.*/.test(a));
  if (modifies) {
    if (!outputPath) throw new Error('Output path is required for write operations.');
    args.push('-o', outputPath);
  }
  args.push(inputPath);
  return { args, modifies, command: ['exiftool', ...args.map(a => a.includes(' ') ? JSON.stringify(a) : a)].join(' ') };
}

export function runExiftool(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.exiftoolPath, args, { shell: false, windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('ExifTool timed out.')); }, timeoutMs);
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

export async function deleteExpired() {
  await ensureTempRoot();
  const now = Date.now();
  for (const ent of await fs.readdir(config.tempRoot, { withFileTypes: true })) {
    const p = resolveTemp(ent.name); const st = await fs.stat(p).catch(() => null);
    if (st && now - st.mtimeMs > config.expirationMs) await fs.rm(p, { recursive: true, force: true });
  }
}

export const explorerOptions = [
  ['-a', 'Shows duplicate tags.'],
  ['-G1', 'Shows metadata group names.'],
  ['-s', 'Shows compact ExifTool tag names.'],
  ['-json', 'Returns structured JSON for the Metadata Explorer.'],
];

export function buildExplorerArgs(inputPath) {
  const args = [...explorerOptions.map(([flag]) => flag), inputPath];
  return { args, command: ['exiftool', ...args.map(a => a.includes(' ') ? JSON.stringify(a) : a)].join(' '), explanations: explorerOptions.map(([flag, explanation]) => ({ flag, explanation })) };
}

export function parseExplorerJson(stdout = '') {
  let docs;
  try { docs = JSON.parse(stdout || '[]'); } catch { docs = []; }
  const source = Array.isArray(docs) ? docs[0] || {} : docs || {};
  const seen = new Map();
  const rows = [];
  for (const [fullKey, raw] of Object.entries(source)) {
    if (fullKey === 'SourceFile') continue;
    const textKey = String(fullKey);
    const split = textKey.includes(':') ? textKey.split(':') : ['Other', textKey];
    const group = split.length > 1 ? split.shift() || 'Other' : 'Other';
    const tag = split.join(':') || textKey;
    const value = raw == null ? '' : Array.isArray(raw) || typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    const duplicateKey = tag;
    const instance = (seen.get(duplicateKey) || 0) + 1;
    seen.set(duplicateKey, instance);
    rows.push({ group, tag, label: labelForTag(tag), rawValue: raw, value, displayValue: value === '' ? '(empty)' : value, source: group, instance, duplicate: instance > 1 });
  }
  return summarizeExplorerRows(rows);
}

export function summarizeExplorerRows(rows = []) {
  const groups = {};
  for (const row of rows) (groups[row.group || 'Other'] ||= []).push(row);
  const duplicateTagCount = rows.filter(r => r.duplicate).length;
  const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  return {
    rows,
    groups,
    stats: {
      totalTags: rows.length,
      totalGroups: groupNames.length,
      duplicateTagCount,
      gpsGroups: groupNames.filter(g => /gps/i.test(g) || groups[g].some(r => /gps/i.test(r.tag))).length,
      dateTimeGroups: groupNames.filter(g => groups[g].some(r => /(date|time)/i.test(r.tag))).length,
      embeddedImageGroups: groupNames.filter(g => groups[g].some(r => /(thumbnail|preview|embedded|gain.?map|depth)/i.test(r.tag))).length,
    },
    findings: buildInterestingFindings(rows),
  };
}

export function buildInterestingFindings(rows = []) {
  const has = (re) => rows.find(r => re.test(`${r.group} ${r.tag} ${r.value}`));
  const val = (re) => rows.find(r => re.test(r.tag) && r.value)?.value;
  const findings = [];
  if (has(/\bGPS\b|GPSLatitude|GPSLongitude|GPSPosition/i)) findings.push('GPS metadata is present.');
  const model = val(/^(Model|DeviceModelName)$/i); if (model) findings.push(`Camera or phone model detected: ${model}.`);
  const software = val(/^Software$/i); if (software) findings.push(`Software/editor field detected: ${software}.`);
  if (has(/ThumbnailImage/i)) findings.push('Embedded thumbnail metadata is present.');
  if (has(/PreviewImage/i)) findings.push('Embedded preview metadata is present.');
  if (has(/HDR|Gain.?Map/i)) findings.push('HDR or gain-map-related metadata detected.');
  if (has(/Depth/i)) findings.push('Depth-related metadata detected.');
  if (has(/QuickTime/i)) findings.push('QuickTime metadata is present.');
  const created = val(/^(DateTimeOriginal|CreateDate|CreationDate)$/i), modified = val(/^(ModifyDate|ModificationDate)$/i);
  if (created && modified && created !== modified) findings.push('Creation and modification date tags report different values.');
  if (has(/Serial/i)) findings.push('Serial-number-like tags detected.');
  if (has(/Copyright|Artist|Author/i)) findings.push('Copyright or author tags are present.');
  return findings.slice(0, 12);
}

export function labelForTag(tag = '') {
  return String(tag).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}
