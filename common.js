/* Shared logic for desk.html and scan.html */
const TEC = (() => {
  const KEY = 'tecGateConfig', DUP_MS = 4000;
  const parse = s => { try { return JSON.parse(s) || {}; } catch (e) { return {}; } };
  const admin = parse(localStorage.getItem('tecAdminConfig'));
  let cfg = Object.assign({ url: admin.url || '', token: admin.token || '', mode: 'AUTO', gate: 'Main Gate', device: 'Security Desk' }, parse(localStorage.getItem(KEY)));
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODES = { AUTO: '⚡ Auto IN / OUT', MANUAL: '✋ Manual IN / OUT', IN: '🟢 Entry-only (IN)', OUT: '🟠 Exit-only (OUT)' };
  const HELP = {
    AUTO: 'Auto mode: each scan records the opposite of the student’s last direction. The first scan of a day is ENTRY (IN).',
    MANUAL: 'Manual mode: scan and verify the student, then choose ENTRY (IN) or EXIT (OUT).',
    IN: 'Only IN mode: every valid scan records ENTRY (IN).',
    OUT: 'Only OUT mode: every valid scan records EXIT (OUT). Hostel students need warden approval before an OUT is recorded.'
  };

  async function api(payload) {
    if (!cfg.url || !cfg.token) return { ok: false, message: 'Open ⚙️ Settings and enter the Apps Script URL and access token.' };
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 30000);
    try {
      // No custom headers => "simple" request, so the browser sends no CORS preflight (Apps Script cannot answer one).
      const res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify(Object.assign({ token: cfg.token }, payload)), signal: ctl.signal });
      const text = await res.text();
      try { return JSON.parse(text); }
      catch (e) { return { ok: false, message: 'Backend returned an unexpected response. Check that the web app is deployed with access “Anyone” and the URL ends with /exec.' }; }
    } catch (e) {
      return { ok: false, message: e.name === 'AbortError' ? 'The server took too long to respond. Try again.' : 'Could not reach Apps Script. Check the URL, deployment access and internet.' };
    } finally { clearTimeout(timer); }
  }

  /* ---------- UI mounting ---------- */
  let busy = false, lastCode = '', lastAt = 0, selected = null, pollTimer = null, onDone = () => {};
  function msg(text, type) { const m = $('message'); m.className = 'status ' + (type || 'info'); m.textContent = text; }
  function beep(ok) {
    try { if (navigator.vibrate) navigator.vibrate(ok ? 80 : [120, 60, 120]);
      const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
      o.frequency.value = ok ? 880 : 220; g.gain.value = .08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + .12); } catch (e) {}
  }
  function showStudent(s) {
    const p = $('studentPanel');
    p.innerHTML = [['Student Name', s.name], ['Barcode ID', s.barcode], ['Register No.', s.reg], ['Gender', s.gender], ['Department', s.dept], ['Year', s.year], ['Hostel / Day Scholar', s.hostel], ['Institution', s.inst]]
      .map(x => '<strong>' + x[0] + ':</strong> ' + esc(x[1])).join('<br>');
    p.hidden = false;
  }
  function applyMode() {
    $('modeStatus').textContent = MODES[cfg.mode] || MODES.AUTO;
    $('subtitle').textContent = cfg.gate + ' · ' + cfg.device;
    $('modeHelp').textContent = HELP[cfg.mode] || HELP.AUTO;
    $('manualActions').hidden = true;
  }
  function clearStudent(quiet) {
    clearInterval(pollTimer); selected = null; $('studentPanel').hidden = true; $('manualActions').hidden = true;
    if (!quiet) msg('Ready for the next student.', 'info');
    onDone();
  }
  function setBusy(b) { busy = b; ['manualInBtn', 'manualOutBtn'].forEach(id => $(id).disabled = b); }

  function pollOuting(code) {
    clearInterval(pollTimer); let n = 0;
    pollTimer = setInterval(async () => {
      if (++n > 120) return clearInterval(pollTimer);
      const r = await api({ action: 'outingStatus', code });
      if (!r.ok) return;
      if (r.status === 'APPROVED') { clearInterval(pollTimer); msg('✅ Permission APPROVED' + (r.approver ? ' by ' + r.approver : '') + '. Scan the ID again to record the exit.', 'success'); beep(true); }
      else if (r.status === 'REJECTED') { clearInterval(pollTimer); msg('❌ Permission was REJECTED. The student cannot exit.', 'error'); beep(false); }
    }, 5000);
  }

  function showResult(r, code) {
    clearInterval(pollTimer);
    if (r.student) showStudent(r.student);
    if (r.ok) {
      const inn = r.direction === 'IN';
      msg((inn ? '🟢 ENTRY (IN)' : '🟠 EXIT (OUT)') + ' recorded for ' + r.student.name + ' at ' + r.timestamp + '.' + (r.message || ''), inn ? 'success' : 'out');
      beep(true);
    } else if (r.pending) { msg('⏳ ' + r.message, 'warn'); beep(false); pollOuting(code); }
    else if (r.duplicate) { msg(r.message, 'info'); }
    else { msg(r.message || 'Not recorded.', 'error'); beep(false); }
  }

  async function submit(raw) {
    const code = String(raw || '').trim();
    if (!code || busy) return;
    if (!cfg.url || !cfg.token) { msg('Open ⚙️ Settings and enter the Apps Script URL and access token first.', 'error'); $('settings').classList.add('open'); return; }
    if (code.toUpperCase() === lastCode && Date.now() - lastAt < DUP_MS) return;   // camera/scanner repeat guard
    lastCode = code.toUpperCase(); lastAt = Date.now();
    setBusy(true); clearInterval(pollTimer); selected = null; $('manualActions').hidden = true;
    msg('Verifying student…', 'info');
    try {
      if (cfg.mode === 'MANUAL') {
        const r = await api({ action: 'getStudent', code });
        if (!r.ok) { msg(r.message, 'error'); $('studentPanel').hidden = true; }
        else if (!r.found) { msg(r.message, 'error'); $('studentPanel').hidden = true; beep(false); }
        else { showStudent(r.student); if (r.message) { msg(r.message, 'error'); beep(false); } else { selected = r.student; $('manualActions').hidden = false; msg('Student verified. Choose green ENTRY (IN) or orange EXIT (OUT).', 'success'); beep(true); } }
      } else {
        const r = await api({ action: 'scan', code, mode: cfg.mode, gate: cfg.gate, device: cfg.device });
        if (!r.ok && !r.student) $('studentPanel').hidden = true;
        showResult(r, code);
      }
    } finally { setBusy(false); lastAt = Date.now(); onDone(); }
  }
  async function manual(direction) {
    if (!selected || busy) return msg('Scan and verify a student first.', 'error');
    setBusy(true); msg('Recording…', 'info');
    const code = selected.barcode;
    const r = await api({ action: 'scan', code, mode: 'MANUAL', direction, gate: cfg.gate, device: cfg.device });
    setBusy(false);
    showResult(r, code);
    if (r.ok) { selected = null; $('manualActions').hidden = true; lastAt = Date.now(); }
    onDone();
  }

  function mount(opts) {
    onDone = opts.onDone || (() => {});
    $('settings').innerHTML = `<h2 style="margin:0 0 6px">⚙️ Settings</h2>
      <label for="cfgUrl">Apps Script web app URL (ends with /exec)</label><input id="cfgUrl" type="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec">
      <label for="cfgToken">Access token</label><input id="cfgToken" type="password" autocomplete="off">
      <label for="cfgMode">Scan mode</label><select id="cfgMode">${Object.keys(MODES).map(k => `<option value="${k}">${MODES[k]}</option>`).join('')}</select>
      <label for="cfgGate">Gate name</label><input id="cfgGate" autocomplete="off">
      <label for="cfgDevice">Device name</label><input id="cfgDevice" autocomplete="off">
      <div class="row"><button type="button" class="btn" id="cfgSave">💾 Save</button><button type="button" class="btn secondary" id="cfgTest">Test connection</button></div>
      <div id="cfgMsg" class="small"></div>`;
    const fill = () => { $('cfgUrl').value = cfg.url; $('cfgToken').value = cfg.token; $('cfgMode').value = cfg.mode; $('cfgGate').value = cfg.gate; $('cfgDevice').value = cfg.device; };
    const read = () => {
      cfg = { url: $('cfgUrl').value.trim(), token: $('cfgToken').value.trim(), mode: $('cfgMode').value, gate: $('cfgGate').value.trim() || 'Main Gate', device: $('cfgDevice').value.trim() || 'Security Desk' };
      localStorage.setItem(KEY, JSON.stringify(cfg)); applyMode();
    };
    $('settingsToggle').onclick = () => $('settings').classList.toggle('open');
    $('cfgSave').onclick = () => { read(); $('cfgMsg').textContent = 'Saved on this device.'; msg('Settings saved. Mode: ' + MODES[cfg.mode], 'success'); };
    $('cfgTest').onclick = async () => { read(); $('cfgMsg').textContent = 'Testing…'; const r = await api({ action: 'ping' }); $('cfgMsg').textContent = r.ok ? '✅ Connected.' : '❌ ' + (r.message || 'Failed.'); };
    $('manualInBtn').onclick = () => manual('IN'); $('manualOutBtn').onclick = () => manual('OUT');
    $('clearBtn').onclick = () => clearStudent(false);
    fill(); applyMode();
    if (!cfg.url || !cfg.token) { $('settings').classList.add('open'); msg('First-time setup: enter the Apps Script URL and access token in Settings, then press Save.', 'info'); }
  }
  return { mount, submit, api, esc, $, get cfg() { return cfg; } };
})();
