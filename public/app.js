const state = {
  file: null,
  preset: 'basic',
  flags: [],
  edits: {},
  presets: {},
  hist: JSON.parse(sessionStorage.mlHist || '[]'),
  about: { version: '1.0.0', exiftoolVersion: 'Unknown' },
  generatedCommand: '',
  explorer: null,
  selectedGroup: '',
  sort: { key: 'tag', dir: 1 },
  selectedRow: null,
  tools: {},
  investigation: null,
};

const $ = (id) => document.getElementById(id);

const flagGroups = {
  Inspection: [
    ['-a', 'Allow duplicate tags so repeated metadata is visible.'],
    ['-U', 'Show unknown tags ExifTool can decode.'],
    ['-G1', 'Show family 1 group names such as EXIF, XMP, and QuickTime.'],
    ['-s', 'Use compact tag names in the report.'],
    ['-j', 'Return JSON output for archiving or comparison.'],
  ],
  Validation: [
    ['-validate', 'Validate the file structure and metadata consistency.'],
    ['-warning', 'Show ExifTool warnings.'],
    ['-ee', 'Extract embedded metadata from media streams.'],
  ],
  Extraction: [
    ['-b', 'Output binary values when extracting previews.'],
    ['-thumbnailimage', 'Extract an embedded thumbnail when present.'],
    ['-previewimage', 'Extract an embedded preview when present.'],
  ],
  Removal: [
    ['-all=', 'Remove all writable metadata from the output copy.'],
    ['-gps:all=', 'Remove GPS metadata from the output copy.'],
    ['-xmp:geotag=', 'Remove XMP geotag trail data.'],
  ],
};

const tagExplanations = {
  Make: 'Reports the camera or device maker written in metadata.',
  Model: 'Reports the camera or phone model written in metadata.',
  Software: 'Reports software that wrote or edited the metadata.',
  DateTimeOriginal: 'Reports the original capture date/time when the device provided it.',
  CreateDate: 'Reports a creation date/time stored by the file or metadata format.',
  ModifyDate: 'Reports a modification date/time stored by the file or metadata format.',
  GPSLatitude: 'Reports latitude metadata if location data is present.',
  GPSLongitude: 'Reports longitude metadata if location data is present.',
  GPSPosition: 'Reports a combined GPS position string when ExifTool derives one.',
  Orientation: 'Reports intended image rotation/orientation.',
  ImageWidth: 'Reports image pixel width.',
  ImageHeight: 'Reports image pixel height.',
  ColorSpace: 'Reports the encoded color space metadata.',
  Artist: 'Reports an artist/creator tag if present.',
  Copyright: 'Reports a copyright statement if present.',
  LensModel: 'Reports the lens model if camera metadata includes it.',
  ExposureTime: 'Reports camera exposure duration.',
  FNumber: 'Reports lens aperture as an f-number.',
  ISO: 'Reports sensor sensitivity metadata.',
  FocalLength: 'Reports lens focal length metadata.',
  ThumbnailImage: 'Reports embedded thumbnail data or its presence.',
  PreviewImage: 'Reports embedded preview data or its presence.',
  XMP: 'XMP is an extensible metadata format used by many editors and asset tools.',
  CreationDate: 'Reports a QuickTime or media creation date when available.',
  DeviceManufacturer: 'Reports Apple maker-note device manufacturer information when present.',
  DeviceModelName: 'Reports Apple maker-note device model information when present.',
};

function setStatus(text) {
  $('statusText').textContent = text;
}

function setGeneratedCommand(command = '') {
  state.generatedCommand = command;
  $('cmd').textContent = command || 'Select a file and press Generate Command or Run ExifTool.';
  $('commandAddress').value = command || 'exiftool';
  $('clip').disabled = !command;
  $('toolCopy').disabled = !command;
}

function err(text) {
  $('err').innerHTML = text ? `<div class="err">${escapeHtml(text)}</div>` : '';
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function modifies() {
  return ['privacy', 'removeGps', 'removeWritable', 'preserveDates'].includes(state.preset)
    || state.flags.some((flag) => flag.endsWith('='))
    || Object.values(state.edits).some(Boolean);
}

async function init() {
  const cfg = await (await fetch('/api/config')).json();
  state.presets = cfg.presets;
  await loadAbout();
  await loadTools();
  renderPresets();
  renderFlags();
  renderEdits();
  renderHist();
  updateMode();
  wireNavigation();
}


async function loadTools() {
  try {
    const res = await fetch('/api/tools');
    if (res.ok) state.tools = (await res.json()).tools || {};
  } catch {
    state.tools = {};
  }
}

function renderCapabilities(capabilities = state.file?.capabilities || []) {
  const toolForCap = { metadata: 'exiftool', media: 'ffprobe', hashes: 'hash', strings: 'strings', ocr: 'tesseract', qr: 'zbarimg', embedded: 'exiftool', frames: 'ffmpeg', image: 'identify', binary: 'binwalk' };
  $('capabilities').innerHTML = capabilities.length ? capabilities.map((cap) => {
    const tool = state.tools[toolForCap[cap.id]];
    const installed = !tool || tool.installed;
    const enabled = cap.enabled && installed;
    const why = enabled ? 'Available for this file.' : (!cap.applicable ? cap.reason : `${tool?.displayName || 'Tool'} is unavailable.`);
    return `<button type="button" class="capability ${enabled ? '' : 'disabled'}" data-analysis="${cap.id}" ${enabled ? '' : 'disabled'}><b>${escapeHtml(cap.label)}</b><span>${escapeHtml(why)}</span></button>`;
  }).join('') : 'Select and upload a file to see available tools.';
}

function openUtilitiesDialog() {
  $('utilitiesList').innerHTML = Object.values(state.tools).map((tool) => `<p><b>${escapeHtml(tool.displayName)}</b><br>${tool.installed ? 'Installed' : 'Unavailable'} — ${escapeHtml(tool.version || 'Unknown')}<br><small>${escapeHtml(tool.purpose || '')}</small></p>`).join('') || '<p>No utility information loaded.</p>';
  $('utilitiesDialog').hidden = false;
  $('utilitiesClose').focus();
}
function closeUtilitiesDialog() { $('utilitiesDialog').hidden = true; }

async function runInvestigation(analyses = ['hashes', 'strings']) {
  if (!state.file) { err('Select a file first.'); return; }
  $('taskProgress').textContent = 'running';
  const res = await fetch('/api/investigate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...state.file, analyses, minLength: Number($('stringsMin')?.value || 6) }) });
  const json = await res.json();
  if (!res.ok) { err(json.error); $('taskProgress').textContent = 'failed'; return; }
  state.investigation = json;
  if (json.hashes) renderHashes(json.hashes);
  if (json.strings) renderStrings(json.strings);
  $('reportResult').textContent = JSON.stringify(json.report, null, 2);
  $('taskProgress').textContent = `completed: ${json.completed.join(', ') || 'none'}`;
  setStatus('Investigation completed');
}

function renderHashes(hashes) {
  $('hashResults').innerHTML = Object.entries(hashes).map(([algorithm, hash]) => `<p><b>${escapeHtml(algorithm.toUpperCase())}</b><br><code>${escapeHtml(hash)}</code> <button type="button" data-copy-hash="${escapeHtml(hash)}">Copy</button></p>`).join('');
  document.querySelectorAll('[data-copy-hash]').forEach((b) => b.onclick = () => copyText(b.dataset.copyHash, 'Hash copied'));
}
function renderStrings(strings) {
  const q = $('stringsFilter')?.value.toLowerCase() || '';
  const rows = strings.filter((row) => !q || row.value.toLowerCase().includes(q));
  $('stringsResult').innerHTML = rows.length ? `<ol>${rows.map((row) => `<li><code>${escapeHtml(row.value)}</code> <button type="button" data-copy-string="${row.line}">Copy</button></li>`).join('')}</ol>` : 'No strings matched.';
  document.querySelectorAll('[data-copy-string]').forEach((b) => b.onclick = () => copyText(strings.find((row) => row.line === Number(b.dataset.copyString))?.value || '', 'String copied'));
}
async function verifyHashInput() {
  const expected = $('hashVerify').value;
  const hashes = state.investigation?.hashes;
  if (!hashes || !expected) { $('hashVerifyResult').textContent = ''; return; }
  const actual = expected.length === 32 ? hashes.md5 : hashes.sha256;
  const res = await fetch('/api/verify-hash', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actual, expected }) });
  $('hashVerifyResult').textContent = (await res.json()).result;
}

async function loadAbout() {
  try {
    const res = await fetch('/api/about');
    if (res.ok) state.about = await res.json();
  } catch {
    // About still opens with the built-in version if the endpoint is unavailable.
  }
  $('aboutVersion').textContent = state.about.version || '1.0.0';
  $('aboutExif').textContent = state.about.exiftoolVersion || 'Unknown';
}

function renderPresets() {
  $('presets').innerHTML = Object.entries(state.presets).map(([key, preset]) => `
    <button class="preset-item ${preset.mode === 'write' ? 'write' : 'read'}" data-preset="${key}" aria-pressed="${state.preset === key}">
      <span class="preset-icon mini-icon ${preset.mode === 'write' ? 'icon-tools' : 'icon-search'}"></span>
      <span><strong>${escapeHtml(preset.label)}</strong><small>${preset.mode === 'write' ? 'Modifies metadata in a copy' : 'Read-only inspection'}</small></span>
    </button>
  `).join('');

  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.onclick = () => {
      state.preset = button.dataset.preset;
      renderPresets();
      updateMode();
      setStatus(`Selected preset: ${button.textContent.trim()}`);
    };
  });
}

function renderEdits() {
  $('edits').innerHTML = ['Title', 'Description', 'Author', 'Artist', 'Copyright', 'Keywords', 'Comment'].map((tag) => `
    <label><span>${tag}</span><input data-edit="${tag}" value="${escapeHtml(state.edits[tag] || '')}"></label>
  `).join('');

  document.querySelectorAll('[data-edit]').forEach((input) => {
    input.oninput = () => {
      state.edits[input.dataset.edit] = input.value;
      updateMode();
    };
  });
}

function renderFlags() {
  if (!$('expert').checked) {
    $('flags').innerHTML = '<div class="empty-tree">Expert controls are hidden. Enable the checkbox to browse grouped ExifTool flags.</div>';
    return;
  }

  const query = $('search').value.toLowerCase();
  $('flags').innerHTML = Object.entries(flagGroups).map(([group, items]) => {
    const filtered = items.filter(([flag, description]) => (flag + description).toLowerCase().includes(query));
    return `
      <fieldset class="flag-group">
        <legend>${group}</legend>
        ${filtered.map(([flag, description]) => `
          <label class="flag"><input type="checkbox" data-flag="${flag}" ${state.flags.includes(flag) ? 'checked' : ''}><code>${flag}</code><span>${description}</span></label>
        `).join('') || '<p class="empty-tree">No matching flags.</p>'}
      </fieldset>
    `;
  }).join('');

  document.querySelectorAll('[data-flag]').forEach((input) => {
    input.onchange = () => {
      state.flags = input.checked ? [...state.flags, input.dataset.flag] : state.flags.filter((flag) => flag !== input.dataset.flag);
      updateMode();
    };
  });
}

function renderHist() {
  $('hist').innerHTML = state.hist.length
    ? state.hist.map((item) => `<p><b>${escapeHtml(item.t)}</b> ${escapeHtml(item.preset)}<br><code>${escapeHtml(item.cmd)}</code></p>`).join('')
    : '<p>No commands in this browser session.</p>';
}


function explorerGroups() {
  return Object.keys(state.explorer?.groups || {}).sort((a, b) => a.localeCompare(b));
}

function rowSearchText(row) {
  return `${row.group} ${row.tag} ${row.label || ''} ${row.displayValue || row.value || ''}`.toLowerCase();
}

function filteredRows(group = state.selectedGroup) {
  const q = $('metadataSearch')?.value.trim().toLowerCase() || '';
  const rows = (state.explorer?.groups?.[group] || []).filter((row) => !q || rowSearchText(row).includes(q));
  return rows.sort((a, b) => String(a[state.sort.key] ?? '').localeCompare(String(b[state.sort.key] ?? '')) * state.sort.dir);
}

function renderExplorer() {
  const explorer = state.explorer;
  if (!explorer || !explorer.rows?.length) {
    $('explorerPanel').hidden = true;
    return;
  }
  $('explorerPanel').hidden = false;
  const groups = explorerGroups();
  if (!state.selectedGroup || !groups.includes(state.selectedGroup)) state.selectedGroup = groups[0] || 'Other';
  const q = $('metadataSearch').value.trim().toLowerCase();
  const matchingGroups = groups.filter((group) => !q || group.toLowerCase().includes(q) || (explorer.groups[group] || []).some((row) => rowSearchText(row).includes(q)));
  $('explorerStats').innerHTML = [
    ['Total tags', explorer.stats.totalTags], ['Groups', explorer.stats.totalGroups], ['Duplicate tags', explorer.stats.duplicateTagCount],
    ['GPS groups', explorer.stats.gpsGroups], ['Date/time groups', explorer.stats.dateTimeGroups], ['Embedded image groups', explorer.stats.embeddedImageGroups],
  ].map(([k, v]) => `<span><b>${escapeHtml(k)}</b>${escapeHtml(v)}</span>`).join('');
  $('findings').innerHTML = `<b>Interesting Findings</b>${explorer.findings?.length ? `<ul>${explorer.findings.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : '<div>No simple findings detected in the structured metadata.</div>'}`;
  $('metadataTree').innerHTML = `<button class="tree-root" type="button" aria-expanded="true">▾ Metadata <span>${explorer.rows.length}</span></button>` + matchingGroups.map((group) => `<button type="button" role="treeitem" tabindex="0" class="tree-item ${group === state.selectedGroup ? 'selected' : ''}" data-group="${escapeHtml(group)}" aria-selected="${group === state.selectedGroup}"><span class="mini-icon icon-folder"></span>${escapeHtml(group)} <small>${(explorer.groups[group] || []).length}</small></button>`).join('');
  document.querySelectorAll('[data-group]').forEach((button) => {
    button.onclick = () => { state.selectedGroup = button.dataset.group; renderExplorer(); };
    button.onkeydown = (event) => { if (event.key === 'Enter') button.click(); };
  });
  renderExplorerRows();
  const matchCount = q ? explorer.rows.filter((row) => rowSearchText(row).includes(q)).length : explorer.rows.length;
  $('metadataSearchCount').textContent = `${matchCount} result${matchCount === 1 ? '' : 's'}`;
}

function renderExplorerRows() {
  const rows = filteredRows();
  $('selectedGroupTitle').textContent = `${state.selectedGroup || 'Metadata'} (${rows.length})`;
  $('metadataRows').innerHTML = `<div class="metadata-header" role="row">${['tag', 'displayValue', 'group', 'source'].map((key) => `<button type="button" data-sort="${key}" role="columnheader">${key === 'displayValue' ? 'Value' : key === 'source' ? 'Type / source' : key[0].toUpperCase() + key.slice(1)}</button>`).join('')}</div>` + (rows.length ? rows.map((row, i) => `<div class="metadata-row" role="row" tabindex="0" data-row="${i}"><span><b>Tag</b>${escapeHtml(row.tag)}${row.duplicate ? ' <em>duplicate</em>' : ''}</span><span><b>Value</b>${escapeHtml(row.displayValue || '(empty)')}</span><span><b>Group</b>${escapeHtml(row.group)}</span><span><b>Type / source</b>${escapeHtml(row.source || row.group)}<button type="button" data-copy-row="${i}">Copy Row</button><button type="button" data-copy-tag="${i}">Copy Tag</button><button type="button" data-copy-value="${i}">Copy Value</button></span></div>`).join('') : '<p class="empty-tree">No metadata rows match the current search.</p>');
  document.querySelectorAll('[data-sort]').forEach((button) => { button.onclick = () => { state.sort.dir = state.sort.key === button.dataset.sort ? -state.sort.dir : 1; state.sort.key = button.dataset.sort; renderExplorerRows(); }; });
  document.querySelectorAll('[data-row]').forEach((rowEl) => {
    rowEl.onclick = (event) => { if (!event.target.dataset.copyRow && !event.target.dataset.copyTag && !event.target.dataset.copyValue) openTagDialog(rows[Number(rowEl.dataset.row)]); };
    rowEl.onkeydown = (event) => { if (event.key === 'Enter') openTagDialog(rows[Number(rowEl.dataset.row)]); };
  });
  document.querySelectorAll('[data-copy-row]').forEach((b) => b.onclick = () => copyText(rowToText(rows[Number(b.dataset.copyRow)]), 'Row copied'));
  document.querySelectorAll('[data-copy-tag]').forEach((b) => b.onclick = () => copyText(rows[Number(b.dataset.copyTag)].tag, 'Tag name copied'));
  document.querySelectorAll('[data-copy-value]').forEach((b) => b.onclick = () => copyText(rows[Number(b.dataset.copyValue)].value, 'Value copied'));
}

function rowToText(row) { return `${row.group}:${row.tag} = ${row.value}`; }

async function copyText(text, message = 'Copied') {
  try {
    await writeClipboardText(String(text ?? ''));
    setStatus(message);
  } catch (error) {
    setStatus(`Copy failed: ${error.message}`);
  }
}

function openTagDialog(row) {
  state.selectedRow = row;
  const key = tagExplanations[row.tag] ? row.tag : Object.keys(tagExplanations).find((k) => row.tag.includes(k) || row.group.includes(k));
  const explanation = tagExplanations[key] || 'This tag was reported by ExifTool. Its meaning depends on the file format, metadata group, and writing software.';
  $('tagDetails').innerHTML = `<dl class="tag-detail-grid"><dt>Tag</dt><dd>${escapeHtml(row.tag)}</dd><dt>Group</dt><dd>${escapeHtml(row.group)}</dd><dt>Value</dt><dd class="long-value">${escapeHtml(row.displayValue || '(empty)')}</dd><dt>Raw value</dt><dd class="long-value">${escapeHtml(row.rawValue == null ? '' : typeof row.rawValue === 'object' ? JSON.stringify(row.rawValue) : row.rawValue)}</dd><dt>Explanation</dt><dd>${escapeHtml(explanation)}</dd><dt>Command</dt><dd><code>${escapeHtml(state.explorer?.command || state.generatedCommand)}</code></dd></dl>`;
  $('tagDialog').hidden = false;
  $('tagClose').focus();
}

function closeTagDialog() { $('tagDialog').hidden = true; }

function openExplorerCommand() {
  const explorer = state.explorer;
  if (!explorer?.command) return;
  $('explorerCommandDetails').innerHTML = `<p><code>${escapeHtml(explorer.command)}</code></p><dl class="tag-detail-grid">${explorer.explanations.map((item) => `<dt>${escapeHtml(item.flag)}</dt><dd>${escapeHtml(item.explanation)}</dd>`).join('')}</dl>`;
  $('commandDialog').hidden = false;
  $('commandClose').focus();
}

function closeCommandDialog() { $('commandDialog').hidden = true; }

function updateMode() {
  const badge = $('modeBadge');
  const isWrite = modifies();
  badge.className = `mode-badge ${isWrite ? 'write' : 'read'}`;
  badge.textContent = isWrite ? 'Creates modified copy' : 'Read-only inspection';
  if (state.file) renderFileInfo();
}

function wireNavigation() {
  document.querySelectorAll('[data-target]').forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll('[data-target]').forEach((nav) => nav.classList.remove('active'));
      button.classList.add('active');
      $(button.dataset.target).scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
}

function fileExtension(name = '') {
  const clean = String(name).split(/[\\/]/).pop() || '';
  const i = clean.lastIndexOf('.');
  return i > -1 ? clean.slice(i + 1).toLowerCase() : '(none)';
}

function renderFileInfo() {
  const json = state.file;
  if (!json) {
    $('fileInfo').className = 'file-info empty';
    $('fileInfo').textContent = 'No file selected.';
    setGeneratedCommand('');
    return;
  }
  $('fileInfo').className = 'file-info';
  $('fileInfo').innerHTML = `
    <dl>
      <dt>Original filename</dt><dd>${escapeHtml(json.filename)}</dd>
      <dt>MIME type</dt><dd>${escapeHtml(json.type)}</dd>
      <dt>File size</dt><dd>${(json.size / 1048576).toFixed(2)} MB (${json.size} bytes)</dd>
      <dt>Extension</dt><dd>${escapeHtml(fileExtension(json.filename))}</dd>
      <dt>Operation</dt><dd>${modifies() ? 'Creates a modified copy; original upload is not overwritten.' : 'Read-only; no output copy is created.'}</dd>
    </dl>
  `;
}

function clearCurrentFile() {
  state.file = null;
  $('file').value = '';
  renderFileInfo();
  setStatus('Current file cleared');
}

async function uploadSelectedFile(file) {
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  err('');
  setStatus('Uploading file…');
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok) {
    err(json.error);
    setStatus('Upload failed');
    return;
  }
  state.file = json;
  renderFileInfo();
  renderCapabilities(json.capabilities);
  setStatus('File loaded');
}

async function api(path) {
  if (!state.file) {
    err('Select a file first.');
    throw new Error('Select a file first.');
  }
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...state.file, preset: state.preset, flags: state.flags, edits: state.edits }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}

async function previewCommand() {
  try {
    const json = await api('/api/command');
    setGeneratedCommand(json.command);
    setStatus('Command generated');
  } catch (error) {
    err(error.message);
  }
}

async function runCommand() {
  try {
    if (modifies() && !confirm('This operation changes metadata in a new output copy. Continue?')) return;
    setStatus('Running ExifTool…');
    const json = await api('/api/run');
    setGeneratedCommand(json.command);
    $('raw').textContent = `${json.stdout || ''}\n${json.stderr || ''}`;
    $('organized').innerHTML = Object.keys(json.organized).length
      ? Object.entries(json.organized).map(([group, rows]) => `<details open><summary>${escapeHtml(group)}</summary>${rows.map((row) => `<p><b>${escapeHtml(row.key)}</b>: ${escapeHtml(row.value)}</p>`).join('')}</details>`).join('')
      : 'No organized metadata lines were returned.';
    $('download').innerHTML = json.download ? `<a class="download-link" href="${json.download}">Download processed output file</a>` : 'No generated output file for read-only operations.';
    state.hist = [{ t: new Date().toLocaleTimeString(), preset: state.preset, cmd: json.command }, ...state.hist].slice(0, 10);
    sessionStorage.mlHist = JSON.stringify(state.hist);
    state.explorer = json.explorer;
    renderExplorer();
    if (json.explorer?.rows?.length) scrollToPanel('explorerPanel');
    renderHist();
    setStatus('ExifTool completed');
  } catch (error) {
    err(error.message);
    setStatus('Run failed');
  }
}

function resetUi() {
  state.flags = [];
  state.edits = {};
  setGeneratedCommand('');
  state.explorer = null;
  $('explorerPanel').hidden = true;
  renderEdits();
  renderFlags();
  updateMode();
  setStatus('Reset complete');
}

function openPanicDialog() {
  $('panicResult').textContent = '';
  $('panicDialog').hidden = false;
  $('panicCancel').focus();
}

function closePanicDialog() {
  $('panicDialog').hidden = true;
}

async function panicDelete() {
  $('panicConfirm').disabled = true;
  $('panicResult').textContent = 'Deleting temporary files…';
  try {
    const res = await fetch('/api/panic', { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || 'Panic delete failed.');
    sessionStorage.removeItem('mlHist');
    state.hist = [];
    renderHist();
    clearCurrentFile();
    $('panicResult').textContent = 'Panic Delete succeeded.';
    setStatus('Panic Delete succeeded');
  } catch (error) {
    $('panicResult').textContent = `Panic Delete failed: ${error.message}`;
    setStatus('Panic Delete failed');
  } finally {
    $('panicConfirm').disabled = false;
  }
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Browser refused clipboard access.');
  } finally {
    ta.remove();
  }
}

async function copyGeneratedCommand() {
  if (!state.generatedCommand) {
    setStatus('Generate a command before copying');
    return;
  }
  try {
    await writeClipboardText(state.generatedCommand);
    setStatus('Command copied to clipboard');
  } catch (error) {
    setStatus(`Copy failed: ${error.message}`);
  }
}

function openAbout() {
  $('aboutDialog').hidden = false;
  $('aboutOk').focus();
}

function closeAbout() {
  $('aboutDialog').hidden = true;
}


function closeMenus() {
  document.querySelectorAll('[data-menu]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  document.querySelectorAll('.xp-menu').forEach((menu) => menu.classList.remove('open'));
}

function toggleMenu(name) {
  const menu = $(`menu-${name}`);
  const button = document.querySelector(`[data-menu="${name}"]`);
  const open = menu.classList.contains('open');
  closeMenus();
  if (!open) {
    menu.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
  }
}

function scrollToPanel(id) {
  $(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showFlagGuide() {
  setStatus('Flag guide: use read-only flags for inspection; amber presets create output copies.');
  scrollToPanel('advancedPanel');
}

function handleMenuAction(action) {
  ({
    'open-file': () => $('file').click(),
    'clear-file': clearCurrentFile,
    'panic-delete': openPanicDialog,
    'generate-command': previewCommand,
    'run-exiftool': runCommand,
    'run-safe-investigation': () => runInvestigation(),
    'installed-utilities': openUtilitiesDialog,
    'reset-options': resetUi,
    'enable-expert': () => { $('expert').checked = true; renderFlags(); scrollToPanel('advancedPanel'); },
    about: openAbout,
    'flag-guide': showFlagGuide,
  }[action]?.());
}

$('file').onchange = (event) => uploadSelectedFile(event.target.files[0]);
$('toolOpen').onclick = () => $('file').click();
$('clearFile').onclick = clearCurrentFile;
$('preview').onclick = previewCommand;
$('toolPreview').onclick = previewCommand;
$('clip').onclick = copyGeneratedCommand;
$('toolCopy').onclick = copyGeneratedCommand;
$('run').onclick = runCommand;
$('toolRun').onclick = runCommand;
$('navCopy').onclick = copyGeneratedCommand;
$('reset').onclick = resetUi;
$('toolReset').onclick = resetUi;
$('panic').onclick = openPanicDialog;
$('toolPanic').onclick = openPanicDialog;
$('panicConfirm').onclick = panicDelete;
$('panicCancel').onclick = closePanicDialog;
$('panicCloseX').onclick = closePanicDialog;
$('expert').onchange = renderFlags;
$('search').oninput = renderFlags;
$('navAbout').onclick = openAbout;
$('aboutOk').onclick = closeAbout;
$('aboutCloseX').onclick = closeAbout;
$('aboutDialog').addEventListener('click', (event) => { if (event.target === $('aboutDialog')) closeAbout(); });
$('panicDialog').addEventListener('click', (event) => { if (event.target === $('panicDialog')) closePanicDialog(); });
$('runSafeInvestigation').onclick = () => runInvestigation();
$('showUtilities').onclick = openUtilitiesDialog;
$('runHashes').onclick = () => runInvestigation(['hashes']);
$('runStrings').onclick = () => runInvestigation(['strings']);
$('stringsFilter').oninput = () => state.investigation?.strings && renderStrings(state.investigation.strings);
$('hashVerify').oninput = verifyHashInput;
$('copyReport').onclick = () => copyText($('reportResult').textContent, 'Report copied');
$('runOcr').onclick = async () => { try { const res = await fetch('/api/validate-ocr-language', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: $('ocrLanguage').value }) }); const json = await res.json(); $('ocrResult').textContent = res.ok ? `OCR is explicit-only. Language ${json.language} is allowed; run endpoint is not automatic.` : json.error; } catch (e) { $('ocrResult').textContent = e.message; } };
$('validateFrameTime').onclick = async () => { const res = await fetch('/api/validate-timestamp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ timestamp: $('frameTimestamp').value }) }); const json = await res.json(); $('frameResult').textContent = res.ok ? `Timestamp accepted: ${json.timestamp}` : json.error; };
$('utilitiesClose').onclick = closeUtilitiesDialog;
$('utilitiesCloseX').onclick = closeUtilitiesDialog;
$('utilitiesDialog').addEventListener('click', (event) => { if (event.target === $('utilitiesDialog')) closeUtilitiesDialog(); });
$('metadataSearch').oninput = renderExplorer;
$('clearMetadataSearch').onclick = () => { $('metadataSearch').value = ''; renderExplorer(); };
$('jumpExplorer').onclick = () => scrollToPanel('explorerPanel');
$('showExplorerCommand').onclick = openExplorerCommand;
$('tagClose').onclick = closeTagDialog;
$('tagCloseX').onclick = closeTagDialog;
$('tagCopyValue').onclick = () => state.selectedRow && copyText(state.selectedRow.value, 'Value copied');
$('tagCopyName').onclick = () => state.selectedRow && copyText(state.selectedRow.tag, 'Tag name copied');
$('tagDialog').addEventListener('click', (event) => { if (event.target === $('tagDialog')) closeTagDialog(); });
$('commandClose').onclick = closeCommandDialog;
$('commandCloseX').onclick = closeCommandDialog;
$('copyExplorerCommand').onclick = () => state.explorer?.command && copyText(state.explorer.command, 'Explorer command copied');
$('commandDialog').addEventListener('click', (event) => { if (event.target === $('commandDialog')) closeCommandDialog(); });

document.querySelectorAll('[data-menu]').forEach((button) => {
  button.addEventListener('click', (event) => { event.stopPropagation(); toggleMenu(button.dataset.menu); });
});
document.querySelectorAll('.xp-menu button').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    closeMenus();
    if (button.dataset.scroll) scrollToPanel(button.dataset.scroll);
    if (button.dataset.action) handleMenuAction(button.dataset.action);
  });
});
document.addEventListener('click', closeMenus);

document.addEventListener('keydown', (event) => {
  const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) && event.target.type !== 'file';
  if (event.key === 'Escape') { closeMenus(); closeAbout(); closePanicDialog(); closeTagDialog(); closeCommandDialog(); closeUtilitiesDialog(); return; }
  if (inField || !(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 'o') { event.preventDefault(); $('file').click(); }
  if (event.key === 'Enter') { event.preventDefault(); runCommand(); }
  if (event.shiftKey && event.key.toLowerCase() === 'c') { event.preventDefault(); copyGeneratedCommand(); }
});

init();
