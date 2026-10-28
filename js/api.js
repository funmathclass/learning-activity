/* ============================================================================
   LEARNING ACTIVITY — Lapisan API (fetch ke Google Apps Script)
   - Semua aksi lewat POST dengan Content-Type text/plain (tanpa CORS preflight).
   - Token sesi HMAC dari server disimpan di localStorage perangkat ini.
   - Aksi baca (idempoten) dicoba ulang sekali bila jaringan putus.
   ============================================================================ */
'use strict';

const Api = (() => {
  const CFG = window.LA_CONFIG || {};
  const KEY = 'la_session';
  const READ_ONLY = ['getInitialData', 'syncData', 'getDataPeriode', 'getPreviewBerkas', 'listJadwal', 'listJadwalPiket', 'getTugasPiketSaya'];

  function configured() {
    return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]{20,}\/exec$/.test(CFG.GAS_URL || '') &&
      /\.apps\.googleusercontent\.com$/.test(CFG.GOOGLE_CLIENT_ID || '') && !/ISI_/.test(CFG.GOOGLE_CLIENT_ID);
  }

  // ── Sesi ──
  function getSession() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && s.exp > Date.now() + 60000 ? s : null; } catch (e) { return null; }
  }
  function setSession(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage diblokir */ } }
  function clearSession() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      localStorage.removeItem(KEY);
      if (s && s.email) localStorage.removeItem('la_boot_' + s.email); // hapus cache data saat keluar
    } catch (e) { /* abaikan */ }
  }

  // ── Transport ──
  async function post(body, attempt) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CFG.TIMEOUT_MS || 60000);
    try {
      const res = await fetch(CFG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // WAJIB text/plain (hindari preflight CORS)
        body: JSON.stringify(body),
        redirect: 'follow',
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error('Server merespons ' + res.status);
      const txt = await res.text();
      try { return JSON.parse(txt); } catch (e) { throw new Error('Respons server bukan JSON. Pastikan deployment memakai akses "Anyone".'); }
    } catch (err) {
      const net = err.name === 'AbortError' || err instanceof TypeError;
      if (net && attempt === 0 && READ_ONLY.includes(body.action)) {
        await new Promise((r) => setTimeout(r, 800));
        return post(body, 1);
      }
      if (err.name === 'AbortError') throw new Error('Server terlalu lama merespons. Coba lagi.');
      if (err instanceof TypeError) throw new Error('Tidak dapat terhubung ke server. Periksa internet atau GAS_URL.');
      throw err;
    } finally { clearTimeout(timer); }
  }

  /** Panggil aksi API; resolve {success,data,message,code}. */
  async function call(action, args) {
    const s = getSession();
    if (!s) return { success: false, code: 'AUTH', message: 'Sesi berakhir. Silakan masuk kembali.' };
    return post({ action, token: s.token, args: args || [] }, 0);
  }

  /** Tukar ID token Google menjadi token sesi + data awal. */
  async function login(credential) {
    return post({ action: 'login', credential }, 0);
  }

  /** "Bangunkan" server (cold start) + cek kesiapan konfigurasi backend. */
  async function ping() {
    try {
      const res = await fetch(CFG.GAS_URL + '?action=ping', { redirect: 'follow' });
      return await res.json();
    } catch (e) { return { success: false, message: e.message }; }
  }

  return { configured, getSession, setSession, clearSession, call, login, ping, cfg: CFG };
})();
