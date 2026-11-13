/* Shared "hidden phone number" widget (used by scan, desk and admin).
   Numbers arrive masked from the server. The full number is requested only when
   "View phone" is pressed, shown for 30 seconds, and every view is audited on the server. */
const PH = (() => {
  const TTL = 30000, cache = new Map();
  let call = null;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const label = (m, p) => [m ? 'Student: ' + m : '', p ? 'Parent: ' + p : ''].filter(Boolean).join(' · ');

  /* html(barcode, maskedStudent, maskedParent, unknown)
     unknown=true -> the list has no masked value (e.g. reports); show dots + a View button. */
  function html(bc, m, p, unknown) {
    if (!unknown && !m && !p) return '<span class="ph-none">No phone on file</span>';
    return '<span class="ph" data-bc="' + esc(bc) + '" data-m="' + esc(m || '') + '" data-p="' + esc(p || '') + '"' + (unknown ? ' data-u="1"' : '') + '></span>';
  }
  function paint(el) {
    el.dataset.ready = '1';
    const bc = el.dataset.bc, c = cache.get(bc), shown = !!(c && c.exp > Date.now());
    if (c && !shown) cache.delete(bc);
    const txt = shown ? (label(c.mobile, c.parent) || 'No phone on file') : (el.dataset.u ? '••••••••••' : label(el.dataset.m, el.dataset.p));
    el.innerHTML = '<span class="ph-txt' + (shown ? ' on' : '') + '">📱 ' + esc(txt) + '</span> <button type="button" class="ph-btn">' + (shown ? '🙈 Hide phone' : '👁 View phone') + '</button>';
  }
  const repaint = bc => document.querySelectorAll('.ph').forEach(el => { if (el.dataset.bc === bc) paint(el); });

  async function show(bc) {
    const r = call ? await call({ action: 'getContact', code: bc }) : { ok: false, message: 'Not connected.' };
    if (!r || !r.ok) return (r && r.message) || 'Could not load the phone number.';
    cache.set(bc, { mobile: r.mobile, parent: r.parentMobile, exp: Date.now() + TTL });
    repaint(bc); return '';
  }
  function hide(bc) { cache.delete(bc); repaint(bc); }

  document.addEventListener('click', async e => {
    const b = e.target.closest('.ph-btn'); if (!b) return;
    const el = b.closest('.ph'), bc = el.dataset.bc, c = cache.get(bc);
    if (c && c.exp > Date.now()) return hide(bc);
    b.disabled = true; b.textContent = 'Loading…';
    const err = await show(bc);
    if (err) { b.disabled = false; b.textContent = '👁 View phone'; el.querySelector('.ph-txt').textContent = '⚠ ' + err; }
  });
  setInterval(() => { const now = Date.now(); [...cache].forEach(([bc, c]) => { if (c.exp <= now) hide(bc); }); }, 5000);   // auto-hide
  new MutationObserver(() => document.querySelectorAll('.ph:not([data-ready])').forEach(paint)).observe(document.documentElement, { childList: true, subtree: true });

  return { init(fn) { call = fn; }, html, show, hide };
})();
