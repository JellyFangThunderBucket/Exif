const state = {
  file: null,
  preset: 'basic',
  flags: [],
  edits: {},
  presets: {},
  hist: JSON.parse(sessionStorage.mlHist || '[]'),
  about: { version: '1.0.0', exiftoolVersion: 'Unknown' },
  generatedCommand: '',
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
  renderPresets();
  renderFlags();
  renderEdits();
  renderHist();
  updateMode();
  wireNavigation();
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

async function copyGeneratedCommand() {
  if (!state.generatedCommand) {
    setStatus('Generate a command before copying');
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(state.generatedCommand);
    } else {
      const ta = document.createElement('textarea');
      ta.value = state.generatedCommand;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      if (!document.execCommand('copy')) throw new Error('Browser refused clipboard access.');
      ta.remove();
    }
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
  if (event.key === 'Escape') { closeMenus(); closeAbout(); closePanicDialog(); return; }
  if (inField || !(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 'o') { event.preventDefault(); $('file').click(); }
  if (event.key === 'Enter') { event.preventDefault(); runCommand(); }
  if (event.shiftKey && event.key.toLowerCase() === 'c') { event.preventDefault(); copyGeneratedCommand(); }
});

init();
