/* Shared logic for desk.html and scan.html (needs phone.js loaded first) */
const TEC = (() => {
  const KEY = 'tecGateConfig', DUP_MS = 4000;
  const parse = s => { try { return JSON.parse(s) || {}; } catch (e) { return {}; } };
  const admin = parse(localStorage.getItem('tecAdminConfig'));
  let cfg = Object.assign({ url: admin.url || '', token: '', mode: 'AUTO', gate: 'Main Gate', device: 'Security Desk', autoStart: 'OUT' }, parse(localStorage.getItem(KEY)));
  if (cfg.autoStart !== 'IN') cfg.autoStart = 'OUT';
  /* Warden-permission switch lives on the server so every device and the admin page share it. */
  let srv = { wardenEnabled: true, wardenScope: 'OUT' }, wardenDirty = false;
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODES = { AUTO: '⚡ Auto IN / OUT', MANUAL: '✋ Manual IN / OUT', IN: '🟢 Entry-only (IN)', OUT: '🟠 Exit-only (OUT)' };
  const word = d => d === 'IN' ? 'ENTRY (IN)' : 'EXIT (OUT)', other = d => d === 'IN' ? 'OUT' : 'IN';
  const SCOPE = { OUT: 'student exit (OUT)', IN: 'student entry (IN)', BOTH: 'student exit and entry' };
  const wardenText = () => srv.wardenEnabled
    ? '🛡 Warden permission is ON for hostel students: ' + SCOPE[srv.wardenScope] + '. Other students scan normally.'
    : '🛡 Warden permission is OFF: every student scans normally.';
  const help = () => ({
    AUTO: 'Auto mode: the first scan of each day records ' + word(cfg.autoStart) + ', the next scan records ' + word(other(cfg.autoStart)) + ', and so on. Use the ⇄ button to change which one comes first.',
    MANUAL: 'Manual mode: scan and verify the student, then choose ENTRY (IN) or EXIT (OUT).',
    IN: 'Only IN mode: every valid scan records ENTRY (IN).',
    OUT: 'Only OUT mode: every valid scan records EXIT (OUT).'
  })[cfg.mode] || '';

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
  let busy = false, lastCode = '', lastAt = 0, selected = null, pollTimer = null, onDone = () => {}, onClear = () => {};
  function msg(text, type) { const m = $('message'); m.className = 'status ' + (type || 'info'); m.textContent = text; }
  function beep(ok) {
    try { if (navigator.vibrate) navigator.vibrate(ok ? 80 : [120, 60, 120]);
      const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
      o.frequency.value = ok ? 880 : 220; g.gain.value = .08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + .12); } catch (e) {}
  }
  function setLast(code) { const el = $('lastScan'); if (!el) return; el.hidden = !code; el.textContent = code ? 'Last scanned: ' + code : ''; }
  function showStudent(s) {
    const p = $('studentPanel');
    p.innerHTML = [['Student Name', s.name], ['Barcode ID', s.barcode], ['Register No.', s.reg], ['Gender', s.gender], ['Department', s.dept], ['Year', s.year], ['Hostel / Day Scholar', s.hostel], ['Institution', s.inst]]
      .map(x => '<strong>' + x[0] + ':</strong> ' + esc(x[1])).join('<br>') +
      '<br><strong>Phone:</strong> ' + PH.html(s.barcode, s.mobileMasked, s.parentMasked);
    p.hidden = false;
  }
  function applyMode() {
    $('modeStatus').textContent = (MODES[cfg.mode] || MODES.AUTO) + (cfg.mode === 'AUTO' ? ' · 1st scan: ' + cfg.autoStart : '');
    $('subtitle').textContent = cfg.gate + ' · ' + cfg.device;
    $('modeHelp').textContent = help() + ' ' + wardenText();
    $('manualActions').hidden = true;
    const b = $('autoDirBtn'); if (b) { b.hidden = cfg.mode !== 'AUTO'; b.textContent = '⇄ First scan of the day: ' + cfg.autoStart + ' (tap to change to ' + other(cfg.autoStart) + ')'; }
  }
  function clearStudent(quiet) {
    clearInterval(pollTimer); selected = null; $('studentPanel').hidden = true; $('manualActions').hidden = true;
    if (!quiet) { msg('Ready for the next student.', 'info'); setLast(''); onClear(); }
    onDone();
  }
  function setBusy(b) { busy = b; ['manualInBtn', 'manualOutBtn'].forEach(id => $(id).disabled = b); }

  function pollOuting(code) {
    clearInterval(pollTimer); let n = 0;
    pollTimer = setInterval(async () => {
      if (++n > 120) return clearInterval(pollTimer);
      const r = await api({ action: 'outingStatus', code });
      if (!r.ok) return;
      const what = r.type === 'IN' ? 'entry' : 'exit';
      if (r.status === 'APPROVED') { clearInterval(pollTimer); msg('✅ Warden permission APPROVED' + (r.approver ? ' by ' + r.approver : '') + '. Scan the ID again to record the ' + what + '.', 'success'); beep(true); }
      else if (r.status === 'REJECTED') { clearInterval(pollTimer); msg('❌ Permission was REJECTED. The student cannot ' + (r.type === 'IN' ? 'enter' : 'exit') + '.', 'error'); beep(false); }
    }, 5000);
  }

  function showResult(r, code) {
    clearInterval(pollTimer);
    if (r.student) showStudent(r.student);
    if (r.ok) {
      const inn = r.direction === 'IN';
      msg((inn ? '🟢 ENTRY (IN)' : '🟠 EXIT (OUT)') + ' recorded for ' + r.student.name + ' at ' + r.timestamp + '.' + (r.message || ''), inn ? 'success' : 'out');
      beep(true);
    } else if (r.pending) { msg('⏳ NOT RECORDED YET – ' + r.message, 'warn'); beep(false); pollOuting(code); }
    else if (r.duplicate) { msg('ℹ️ NOT RECORDED (duplicate) – ' + r.message, 'info'); }
    else { msg('⚠️ NOT RECORDED – ' + (r.message || 'Entry/exit was not saved.'), 'error'); beep(false); }
  }

  async function submit(raw) {
    const code = String(raw || '').trim();
    if (!code || busy) return;
    if (!cfg.url || !cfg.token) { msg('Open ⚙️ Settings and enter the Apps Script URL and access token first.', 'error'); $('settings').classList.add('open'); return; }
    if (code.toUpperCase() === lastCode && Date.now() - lastAt < DUP_MS) return;   // camera/scanner repeat guard
    lastCode = code.toUpperCase(); lastAt = Date.now();
    setLast(code);
    setBusy(true); clearInterval(pollTimer); selected = null; $('manualActions').hidden = true;
    msg('Verifying student…', 'info');
    try {
      if (cfg.mode === 'MANUAL') {
        const r = await api({ action: 'getStudent', code });
        if (!r.ok) { msg('⚠️ ' + r.message, 'error'); $('studentPanel').hidden = true; }
        else if (!r.found) { msg('⚠️ NOT RECORDED – ' + r.message, 'error'); $('studentPanel').hidden = true; beep(false); }
        else { showStudent(r.student); if (r.message) { msg('⚠️ NOT RECORDED – ' + r.message, 'error'); beep(false); } else { selected = r.student; $('manualActions').hidden = false; msg('Student verified. Choose green ENTRY (IN) or orange EXIT (OUT).', 'success'); beep(true); } }
      } else {
        const r = await api({ action: 'scan', code, mode: cfg.mode, autoStart: cfg.autoStart, gate: cfg.gate, device: cfg.device });
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
    onDone = opts.onDone || (() => {}); onClear = opts.onClear || (() => {});
    PH.init(p => api(Object.assign({ device: cfg.device }, p)));
    $('settings').innerHTML = `<h2 style="margin:0 0 6px">⚙️ Settings</h2>
      <label for="cfgUrl">Apps Script web app URL (ends with /exec)</label><input id="cfgUrl" type="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec">
      <label for="cfgToken">Access token</label><input id="cfgToken" type="password" autocomplete="off">
      <label for="cfgMode">Scan mode</label><select id="cfgMode">${Object.keys(MODES).map(k => `<option value="${k}">${MODES[k]}</option>`).join('')}</select>
      <label for="cfgAutoStart">Auto mode – direction of the first scan of the day</label><select id="cfgAutoStart"><option value="OUT">EXIT (OUT) first, next scan IN</option><option value="IN">ENTRY (IN) first, next scan OUT</option></select>
      <label for="cfgGate">Gate name</label><input id="cfgGate" autocomplete="off">
      <label for="cfgDevice">Device name</label><input id="cfgDevice" autocomplete="off">
      <h3 style="margin:18px 0 0;font-size:16px">🛡 Warden permission (hostel students)</h3>
      <label for="cfgWarden">Warden permission request</label><select id="cfgWarden"><option value="true">Enabled – ask the warden for permission</option><option value="false">Disabled – works normally, like every student</option></select>
      <label for="cfgWardenScope">Ask permission for</label><select id="cfgWardenScope"><option value="OUT">Student OUT (exit)</option><option value="IN">Student IN (entry)</option><option value="BOTH">Both OUT and IN</option></select>
      <div class="small" style="margin-top:6px">This switch is shared by all devices and the admin page. Day scholars are never asked.</div>
      <div class="row"><button type="button" class="btn" id="cfgSave">💾 Save</button><button type="button" class="btn secondary" id="cfgTest">Test connection</button></div>
      <div id="cfgMsg" class="small"></div>`;
    const fill = () => { $('cfgUrl').value = cfg.url; $('cfgToken').value = cfg.token; $('cfgMode').value = cfg.mode; $('cfgAutoStart').value = cfg.autoStart; $('cfgGate').value = cfg.gate; $('cfgDevice').value = cfg.device; };
    const fillWarden = () => { $('cfgWarden').value = String(srv.wardenEnabled); $('cfgWardenScope').value = srv.wardenScope; $('cfgWardenScope').disabled = !srv.wardenEnabled; };
    const read = () => {
      cfg = { url: $('cfgUrl').value.trim(), token: $('cfgToken').value.trim(), mode: $('cfgMode').value, autoStart: $('cfgAutoStart').value === 'IN' ? 'IN' : 'OUT', gate: $('cfgGate').value.trim() || 'Main Gate', device: $('cfgDevice').value.trim() || 'Security Desk' };
      localStorage.setItem(KEY, JSON.stringify(cfg)); applyMode();
    };
    async function loadServer() {
      if (!cfg.url || !cfg.token) return;
      const r = await api({ action: 'getSettings' });
      if (r && r.ok && r.settings) { srv = r.settings; wardenDirty = false; fillWarden(); applyMode(); }
    }
    ['cfgWarden', 'cfgWardenScope'].forEach(id => $(id).addEventListener('change', () => { wardenDirty = true; $('cfgWardenScope').disabled = $('cfgWarden').value !== 'true'; }));

    // quick toggle for the Auto first-scan direction, right on the scan screen
    const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'autoDirBtn'; btn.className = 'btn secondary mini'; $('modeStatus').after(btn);
    btn.onclick = () => { cfg.autoStart = other(cfg.autoStart); localStorage.setItem(KEY, JSON.stringify(cfg)); $('cfgAutoStart').value = cfg.autoStart; applyMode(); msg('Auto mode now starts with ' + word(cfg.autoStart) + ' as the first scan of the day.', 'success'); };

    $('settingsToggle').onclick = () => { $('settings').classList.toggle('open'); if ($('settings').classList.contains('open')) loadServer(); };
    $('cfgSave').onclick = async () => {
      read(); let note = 'Saved on this device.', type = 'success';
      if (wardenDirty && cfg.url && cfg.token) {
        $('cfgMsg').textContent = 'Saving…';
        const r = await api({ action: 'saveSettings', device: cfg.device, settings: { wardenEnabled: $('cfgWarden').value === 'true', wardenScope: $('cfgWardenScope').value } });
        if (r && r.ok) { srv = r.settings; wardenDirty = false; note += ' Warden permission updated for all devices.'; }
        else { note += ' ⚠ Warden setting NOT saved: ' + ((r && r.message) || 'unknown error'); type = 'error'; }
      }
      fillWarden(); applyMode(); $('cfgMsg').textContent = note; msg('Settings saved. Mode: ' + MODES[cfg.mode] + '. ' + wardenText(), type);
    };
    $('cfgTest').onclick = async () => { read(); $('cfgMsg').textContent = 'Testing…'; const r = await api({ action: 'ping' }); $('cfgMsg').textContent = r.ok ? '✅ Connected.' : '❌ ' + (r.message || 'Failed.'); if (r.ok) loadServer(); };
    $('manualInBtn').onclick = () => manual('IN'); $('manualOutBtn').onclick = () => manual('OUT');
    $('clearBtn').onclick = () => clearStudent(false);
    fill(); fillWarden(); applyMode(); loadServer();
    if (!cfg.url || !cfg.token) { $('settings').classList.add('open'); msg('First-time setup: enter the Apps Script URL and access token in Settings, then press Save.', 'info'); }
  }
  return { mount, submit, api, esc, $, get cfg() { return cfg; } };
})();
