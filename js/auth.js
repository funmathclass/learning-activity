/* ============================================================================
   LEARNING ACTIVITY — Login "Sign in with Google" (Google Identity Services)
   Alur: tombol Google → ID token → Api.login() → server verifikasi →
         token sesi HMAC + data awal → aplikasi tampil.
   ============================================================================ */
'use strict';

const Auth = (() => {
  let gisReady = false, busyLogin = false;

  const root = () => document.getElementById('loginRoot');
  const e = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, c) => `<span class="msi ${c || ''}" aria-hidden="true">${n}</span>`;

  /** Tampilkan halaman login. msg = pesan opsional (mis. sesi berakhir). */
  function show(msg) {
    document.getElementById('appRoot').hidden = true;
    document.getElementById('deniedRoot').hidden = true;
    const r = root();
    r.hidden = false;
    const ok = Api.configured();
    r.innerHTML = `
      <span class="portal-pill"><i style="background:var(--ok)"></i> PORTAL PRESENSI &amp; JADWAL</span>
      <div class="login-card">
        <div class="login-brand"><span class="logo-mark" style="width:64px;height:64px;border-radius:18px">${icon('school', 'xl')}</span></div>
        <div class="eyebrow mb-1">Learning Activity</div>
        <h1>Masuk ke Aplikasi</h1>
        <p class="lead">Kehadiran guru &amp; karyawan, cover lesson, jadwal piket, dan rekap — gunakan akun Google sekolah Anda.</p>
        ${msg ? `<div class="info-box warn mb-3 text-start">${icon('info')}<div>${e(msg)}</div></div>` : ''}
        ${ok ? `<div id="gsiBtn" class="gsi-slot" aria-live="polite"><div class="spin" style="color:var(--primary)"></div></div>
                <div id="loginState" class="small-xs muted mt-3" aria-live="polite">Memuat tombol Google…</div>`
             : `<div class="info-box warn text-start">${icon('settings_alert')}<div><b>Konfigurasi belum lengkap.</b><br>Isi <code>GAS_URL</code> dan <code>GOOGLE_CLIENT_ID</code> di <code>js/config.js</code>, lalu push ulang ke GitHub.</div></div>`}
        <div class="login-foot">${icon('verified_user', 'sm')} Hanya email yang didaftarkan Admin yang dapat masuk. Tidak ada kata sandi tambahan.</div>
      </div>
      <div class="small-xs muted">LEARNING ACTIVITY v2 · Frontend GitHub Pages · Backend Google Apps Script</div>`;
    hideSplash();
    if (ok) { Api.ping(); renderButton(); }
  }

  function hideSplash() { const s = document.getElementById('bootSplash'); if (s) { s.style.opacity = '0'; setTimeout(() => s.remove(), 260); } }

  function state(html) { const el = document.getElementById('loginState'); if (el) el.innerHTML = html; }

  /** Tunggu pustaka GIS siap lalu render tombol + One Tap. */
  function renderButton(tries) {
    tries = tries || 0;
    const gid = window.google && window.google.accounts && window.google.accounts.id;
    if (!gid) {
      if (tries > 100) { state('Tombol Google gagal dimuat. Periksa koneksi atau pemblokir iklan, lalu muat ulang halaman.'); return; }
      setTimeout(() => renderButton(tries + 1), 100);
      return;
    }
    if (!gisReady) {
      gid.initialize({ client_id: Api.cfg.GOOGLE_CLIENT_ID, callback: onCredential, auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true, itp_support: true, context: 'signin' });
      gisReady = true;
    }
    const slot = document.getElementById('gsiBtn');
    if (!slot) return;
    slot.innerHTML = '';
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    gid.renderButton(slot, { type: 'standard', theme: dark ? 'filled_black' : 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', logo_alignment: 'left', width: Math.min(320, slot.clientWidth || 320), locale: 'id' });
    state('Klik tombol di atas, lalu pilih akun Google sekolah Anda.');
    try { gid.prompt(); } catch (err) { /* One Tap opsional */ }
  }

  async function onCredential(resp) {
    if (busyLogin || !resp || !resp.credential) return;
    busyLogin = true;
    state(`<span class="spin" style="width:14px;height:14px;color:var(--primary)"></span> Memverifikasi akun Anda…`);
    try {
      const r = await Api.login(resp.credential);
      if (r.success) {
        const email = r.data.boot.real.email;
        Api.setSession({ token: r.data.token, exp: r.data.exp, email });
        window.App && App.startWithBoot(r.data.boot, true);
      } else if (r.code === 'TIDAK_TERDAFTAR' || r.code === 'BELUM_SETUP') {
        try { window.google.accounts.id.disableAutoSelect(); } catch (x) { /* abaikan */ }
        window.App && App.showDenied(r.data || { reason: r.code, email: '', waktu: '', appName: 'LEARNING ACTIVITY', sekolah: '' });
      } else {
        state(`<span style="color:var(--sick-fg)">${icon('error', 'sm')} ${e(r.message || 'Login gagal.')}</span>`);
      }
    } catch (err) {
      state(`<span style="color:var(--sick-fg)">${icon('cloud_off', 'sm')} ${e(err.message)}</span>`);
    } finally { busyLogin = false; }
  }

  /** Keluar: hapus sesi & cache data, matikan pilih-otomatis Google. */
  function logout(msg) {
    Api.clearSession();
    try { window.google.accounts.id.disableAutoSelect(); } catch (x) { /* abaikan */ }
    show(msg || 'Anda telah keluar. Silakan masuk kembali.');
  }

  return { show, logout, hideSplash };
})();
