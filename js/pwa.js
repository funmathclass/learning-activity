/* LEARNING ACTIVITY — PWA: pendaftaran Service Worker + ajakan "Pasang di HP".
   Berdiri sendiri: tidak mengubah logika aplikasi. Tersedia sebagai window.LA_PWA. */
(function () {
  'use strict';
  var KEY = 'la_pwa_dismiss', SNOOZE_DAYS = 14;
  var deferred = null;

  function standalone() {
    try { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; } catch (e) { return false; }
  }
  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  }
  function snoozed() {
    try { var t = Number(localStorage.getItem(KEY) || 0); return t && Date.now() - t < SNOOZE_DAYS * 864e5; } catch (e) { return false; }
  }
  function snooze() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* abaikan */ } }

  // 1) Service Worker
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) { console.warn('SW gagal didaftarkan:', err); });
    });
  }

  // 2) Gaya ringan (memakai variabel warna aplikasi, mendukung mode gelap)
  var css = document.createElement('style');
  css.textContent =
    '.pwa-bar{position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:1045;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--surface,#fff);color:var(--text,#0f172a);border:1px solid var(--border,#dbe4ee);box-shadow:0 10px 30px rgba(15,23,42,.18);max-width:520px;margin:0 auto;font:500 14px/1.35 Inter,system-ui,sans-serif}' +
    '@media(min-width:992px){.pwa-bar{left:auto;right:20px;bottom:20px;margin:0}}' +
    '.pwa-bar img{width:44px;height:44px;border-radius:12px;flex:none}.pwa-bar .tx{flex:1;min-width:0}.pwa-bar b{display:block;font-weight:700}.pwa-bar small{color:var(--muted,#64748b)}' +
    '.pwa-bar button{border:0;border-radius:10px;padding:9px 14px;font-weight:700;cursor:pointer;font-size:14px}' +
    '.pwa-bar .go{background:var(--primary-strong,#006194);color:#fff}.pwa-bar .no{background:transparent;color:var(--muted,#64748b);padding:9px 8px}' +
    '.pwa-ov{position:fixed;inset:0;z-index:3100;background:rgba(15,23,42,.5);display:flex;align-items:flex-end;justify-content:center;padding:12px}' +
    '@media(min-width:600px){.pwa-ov{align-items:center}}' +
    '.pwa-box{width:100%;max-width:440px;background:var(--surface,#fff);color:var(--text,#0f172a);border-radius:20px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.3);font:400 15px/1.5 Inter,system-ui,sans-serif}' +
    '.pwa-box h2{font:700 18px/1.3 "Plus Jakarta Sans",Inter,sans-serif;margin:0 0 8px}.pwa-box ol{padding-left:20px;margin:8px 0 14px}.pwa-box li{margin-bottom:6px}' +
    '.pwa-box button{width:100%;border:0;border-radius:12px;padding:11px;font-weight:700;background:var(--primary-strong,#006194);color:#fff;cursor:pointer;font-size:15px}';
  document.head.appendChild(css);

  var bar = null;
  function removeBar() { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); bar = null; }

  function guide() {
    var ios = isIOS();
    var ov = document.createElement('div'); ov.className = 'pwa-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="pwa-box"><h2>Pasang Learning Activity di HP</h2>' +
      (ios
        ? '<ol><li>Buka halaman ini di <b>Safari</b>.</li><li>Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas) di bagian bawah.</li><li>Gulir lalu pilih <b>Tambah ke Layar Utama</b>.</li><li>Ketuk <b>Tambah</b>. Ikonnya muncul di layar utama.</li></ol>'
        : '<ol><li>Buka halaman ini di <b>Chrome</b>.</li><li>Ketuk menu <b>⋮</b> (tiga titik) di kanan atas.</li><li>Pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>.</li><li>Ketuk <b>Instal</b>. Ikonnya muncul di layar utama.</li></ol>') +
      '<button type="button">Mengerti</button></div>';
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('button').addEventListener('click', close);
    document.body.appendChild(ov);
  }

  function install() {
    if (standalone()) return;
    if (deferred) {
      var p = deferred; deferred = null; removeBar();
      p.prompt();
      p.userChoice.then(function (r) { if (r && r.outcome === 'dismissed') snooze(); }).catch(function () {});
    } else { guide(); }
  }

  function showBar(text) {
    if (bar || standalone() || snoozed() || !document.body) return;
    bar = document.createElement('div'); bar.className = 'pwa-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Pasang aplikasi');
    bar.innerHTML = '<img src="icons/icon-192.png" alt=""><div class="tx"><b>Pasang di HP</b><small>' + text + '</small></div><button class="go" type="button">Pasang</button><button class="no" type="button" aria-label="Nanti saja">Nanti</button>';
    bar.querySelector('.go').addEventListener('click', install);
    bar.querySelector('.no').addEventListener('click', function () { snooze(); removeBar(); });
    document.body.appendChild(bar);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    setTimeout(function () { showBar('Buka lebih cepat dari layar utama, tanpa mengetik alamat.'); }, 3000);
  });
  window.addEventListener('appinstalled', function () { deferred = null; removeBar(); snooze(); });
  if (isIOS() && !standalone()) window.addEventListener('load', function () { setTimeout(function () { showBar('Tambahkan ke layar utama agar mudah dibuka.'); }, 4000); });

  window.LA_PWA = { install: install, standalone: standalone, canInstall: function () { return !standalone(); } };
})();
