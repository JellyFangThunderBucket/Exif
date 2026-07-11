const state = {
  file: null,
  preset: 'basic',
  flags: [],
  edits: {},
  presets: {},
  hist: JSON.parse(sessionStorage.mlHist || '[]'),
  about: { version: '1.0.0', exiftoolVersion: 'Unknown' },
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
      <span class="preset-icon">${preset.mode === 'write' ? '🛠️' : '🔍'}</span>
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
  badge.textContent = isWrite ? 'Modifies generated copy' : 'Read-only inspection';
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
  $('fileInfo').className = 'file-info';
  $('fileInfo').innerHTML = `
    <dl>
      <dt>Name</dt><dd>${escapeHtml(json.filename)}</dd>
      <dt>Type</dt><dd>${escapeHtml(json.type)}</dd>
      <dt>Size</dt><dd>${(json.size / 1048576).toFixed(2)} MB</dd>
    </dl>
  `;
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
    $('cmd').textContent = json.command;
    $('commandAddress').value = json.command;
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
    $('cmd').textContent = json.command;
    $('commandAddress').value = json.command;
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
  $('cmd').textContent = 'Reset.';
  $('commandAddress').value = 'exiftool';
  renderEdits();
  renderFlags();
  updateMode();
  setStatus('Reset complete');
}

async function panicDelete() {
  await fetch('/api/panic', { method: 'POST' });
  sessionStorage.removeItem('mlHist');
  location.reload();
}

function openAbout() {
  $('aboutDialog').hidden = false;
  $('aboutOk').focus();
}

function closeAbout() {
  $('aboutDialog').hidden = true;
}

$('file').onchange = (event) => uploadSelectedFile(event.target.files[0]);
$('toolOpen').onclick = () => $('file').click();
$('preview').onclick = previewCommand;
$('toolPreview').onclick = previewCommand;
$('run').onclick = runCommand;
$('toolRun').onclick = runCommand;
$('clip').onclick = async () => {
  await navigator.clipboard?.writeText($('cmd').textContent);
  setStatus('Command copied to clipboard');
};
$('navCopy').onclick = () => $('clip').click();
$('reset').onclick = resetUi;
$('toolReset').onclick = resetUi;
$('panic').onclick = panicDelete;
$('toolPanic').onclick = panicDelete;
$('expert').onchange = renderFlags;
$('search').oninput = renderFlags;
$('helpAbout').onclick = openAbout;
$('navAbout').onclick = openAbout;
$('aboutOk').onclick = closeAbout;
$('aboutCloseX').onclick = closeAbout;
$('aboutDialog').addEventListener('click', (event) => {
  if (event.target === $('aboutDialog')) closeAbout();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('aboutDialog').hidden) closeAbout();
});

init();
