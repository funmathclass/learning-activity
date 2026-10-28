/* ============================================================================
   LEARNING ACTIVITY — Frontend (js/app.js) · GitHub Pages + GAS REST API
   Prinsip gas-instant-ux:
   1) SPA murni  : semua halaman sudah ada di DOM; pindah menu = 0 ms, tanpa
                   panggilan server, tanpa ?page=.
   2) Optimistic : simpan/tugaskan/ubah status langsung tampil, sinkron ke
                   server di latar; gagal → dikembalikan + pesan.
   3) Cache      : data terakhir disimpan di localStorage → buka ulang aplikasi
                   tampil instan, lalu diperbarui di latar (stale-while-revalidate).
                   Sinkron latar hanya menarik data bila versi server berubah.
   4) Batch      : satu panggilan per aksi (mis. absen + kelas + berkas).
   ============================================================================ */
'use strict';

// ════════════════════════════════════════════════════════════════════════════
// 0. UTILITAS
// ════════════════════════════════════════════════════════════════════════════
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem('la_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('la_' + k, JSON.stringify(v)); } catch (e) { /* abaikan */ } },
  del(k) { try { localStorage.removeItem('la_' + k); } catch (e) { /* abaikan */ } }
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms || 250); }; };
const uid = () => 'tmp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = (o) => JSON.parse(JSON.stringify(o));

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const HARI_S = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_S = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function parseD(s) { const p = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
function addDays(s, n) { const d = parseD(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dow(s) { return parseD(s).getUTCDay(); }
function mondayOf(s) { return addDays(s, -((dow(s) + 6) % 7)); }
function diffDays(a, b) { return Math.round((parseD(b) - parseD(a)) / 86400000); }
function fmtD(s) { if (!s) return '—'; const d = parseD(s); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; }
function fmtLong(s) { if (!s) return '—'; const d = parseD(s); return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function fmtMid(s) { if (!s) return '—'; const d = parseD(s); return `${d.getUTCDate()} ${BULAN_S[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function fmtShort(s) { const d = parseD(s); return `${d.getUTCDate()} ${BULAN_S[d.getUTCMonth()]}`; }
function fmtTime(iso) { if (!iso) return ''; const m = String(iso).match(/T(\d{2}):(\d{2})/); return m ? `${m[1]}:${m[2]} WIB` : ''; }
function fmtDT(iso) { return iso ? `${fmtMid(iso.slice(0, 10))} • ${fmtTime(iso)}` : '—'; }
function nowJakarta() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) % 24, iso: `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:00+07:00` };
}
function salam() { const h = nowJakarta().hour; return h < 11 ? 'Selamat Pagi' : h < 15 ? 'Selamat Siang' : h < 18 ? 'Selamat Sore' : 'Selamat Malam'; }
function pct(a, b, dig) { if (!b) return '0%'; return (a / b * 100).toLocaleString('id-ID', { maximumFractionDigits: dig == null ? 1 : dig }) + '%'; }
function num(n) { return Number(n || 0).toLocaleString('id-ID'); }
function initials(n) { return String(n || '?').replace(/^(drs?\.|dra\.|dr\.)\s*/i, '').split(/[\s,]+/).filter((w) => w && !/\./.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
function avCls(id) { let h = 0; String(id).split('').forEach((c) => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return 'av-' + (h % 8); }
function shortName(n) { return String(n || '').split(',')[0]; }
function bytesLabel(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
function ico(name, cls) { return `<span class="msi ${cls || ''}" aria-hidden="true">${name}</span>`; }
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

// ════════════════════════════════════════════════════════════════════════════
// 1. JEMBATAN SERVER (fetch → GAS REST API, lihat js/api.js)
// ════════════════════════════════════════════════════════════════════════════
let pendingOps = 0;
function setSync(txt) { const el = $('#syncState'); if (el) el.innerHTML = txt; }
/** Panggil aksi API → Promise berisi data; gagal → Error(pesan). Sesi habis → kembali ke login. */
function run(fn, ...args) {
  pendingOps++;
  setSync(`<span class="spin" style="width:12px;height:12px"></span> Menyimpan…`);
  return Api.call(fn, args).then((res) => {
    pendingOps = Math.max(0, pendingOps - 1);
    if (!pendingOps) setSync(`${ico('cloud_done', 'sm')} Tersinkron`);
    if (res && res.success) return res.data;
    if (res && (res.code === 'AUTH' || res.code === 'TIDAK_TERDAFTAR')) setTimeout(() => Auth.logout(res.message), 300);
    throw new Error((res && res.message) || 'Terjadi kesalahan di server.');
  }, (err) => {
    pendingOps = Math.max(0, pendingOps - 1);
    setSync(`${ico('cloud_off', 'sm')} Gagal sinkron`);
    throw err;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 2. STATE & INDEKS
// ════════════════════════════════════════════════════════════════════════════
const S = {
  boot: null, ver: '', me: null, real: null, perm: {}, cakupan: 'DIRI', units: null, app: {},
  master: {}, pegawai: [], names: {}, data: {}, admin: null,
  page: 'beranda', unit: 'ALL', tanggal: '', idx: {},
  ui: {
    ber: { q: '', st: '' }, keh: { q: '', st: '', jenis: '', page: 1 }, cov: { st: '' }, tug: { tgl: '' },
    jt: { tahun: '', term: '', unit: '' }, rek: { tahun: '', term: '', mulai: '', selesai: '', q: '', page: 1, sort: 'total', dir: -1, jenis: '' },
    adm: { tab: 'pengguna', q: '', unit: '', peran: '', minggu: '', punit: 'ALL', jm: { unit: '', term: '', mode: 'kelas', item: '' } }
  },
  detailId: '', extra: {}, charts: {}, form: null, lastSync: 0
};

function applyBoot(b) {
  S.boot = b; S.ver = b.ver; S.me = b.me; S.real = b.real; S.perm = b.perm || {}; S.cakupan = b.cakupan;
  S.units = b.units; S.app = b.app; S.master = b.master; S.pegawai = b.pegawai || []; S.names = b.names || {};
  S.data = b.data; S.admin = b.admin; S.today = b.today;
  if (!S.tanggal) S.tanggal = b.today;
  // Unit: pengguna berskala unit dikunci ke unitnya
  if (S.units && S.units.length) S.unit = S.units[0];
  else if (S.cakupan === 'SEMUA') S.unit = ls.get('unit', 'ALL');
  reindex();
}

function reindex() {
  const I = {};
  I.peg = {};
  Object.values(S.names).forEach((p) => { I.peg[p.id_pengguna] = p; });
  S.pegawai.forEach((p) => { I.peg[p.id_pengguna] = p; });
  if (S.admin) S.admin.pengguna.forEach((p) => { if (!I.peg[p.id_pengguna]) I.peg[p.id_pengguna] = p; });
  I.unit = {}; S.master.unit.forEach((u) => { I.unit[u.unit_id] = u; });
  I.unitList = S.master.unit.filter((u) => isOn(u.aktif)).sort((a, b) => Number(a.urutan) - Number(b.urutan));
  I.kelas = {}; S.master.kelas.forEach((k) => { I.kelas[k.kelas_id] = k; });
  I.jam = {}; S.master.jam.forEach((j) => { I.jam[j.jam_id] = j; });
  I.jamByUnit = {};
  S.master.jam.slice().sort((a, b) => Number(a.urutan) - Number(b.urutan)).forEach((j) => { (I.jamByUnit[j.unit_id] = I.jamByUnit[j.unit_id] || []).push(j); });
  I.term = {}; S.master.term.forEach((t) => { I.term[t.term_id] = t; });
  I.tahun = {}; S.master.tahun.forEach((t) => { I.tahun[t.tahun_id] = t; });
  I.jenis = {}; S.master.jenis.forEach((j) => { I.jenis[j.jenis_id] = j; });
  I.peran = {}; S.master.peran.forEach((p) => { I.peran[p.peran_id] = p; });
  I.libur = {}; S.master.libur.forEach((l) => { (I.libur[l.tanggal] = I.libur[l.tanggal] || []).push(l.unit_id || '*'); });
  I.absen = {}; S.data.absen.forEach((a) => { I.absen[a.absen_id] = a; });
  I.coverByAbsen = {}; S.data.cover.forEach((k) => { (I.coverByAbsen[k.absen_id] = I.coverByAbsen[k.absen_id] || []).push(k); });
  I.riwayat = {}; S.data.riwayat.forEach((r) => { (I.riwayat[r.absen_id] = I.riwayat[r.absen_id] || []).push(r); });
  S.idx = I;
}

const isOn = (v) => v === true || ['true', 'ya', '1', 'yes', 'aktif'].includes(String(v).toLowerCase());
const isDiri = () => S.cakupan === 'DIRI';
const canAllUnits = () => S.cakupan === 'SEMUA' || (S.cakupan === 'UNIT' && !S.units);
const nama = (id) => (S.idx.peg[id] || {}).nama || '—';
const pegById = (id) => S.idx.peg[id] || {};
function activeUnits() { return S.unit === 'ALL' ? S.idx.unitList.map((u) => u.unit_id) : [S.unit]; }
function unitLabel() { return S.unit === 'ALL' ? 'semua unit' : S.unit; }
function hariKerja(tgl, unit) {
  const w = dow(tgl);
  if (w === 0 || w === 6) return false;
  const l = S.idx.libur[tgl];
  return !(l && (l.includes('*') || l.includes(unit)));
}
function countHK(mulai, selesai, unit) { let n = 0; for (let d = mulai; d <= selesai; d = addDays(d, 1)) if (hariKerja(d, unit)) n++; return n; }
function pegawaiAktif(units) {
  const set = new Set(units);
  return S.pegawai.filter((p) => p.aktif && (isDiri() ? true : set.has(p.unit_id)));
}
function absenAktifOn(tgl, units) {
  const set = units ? new Set(units) : null;
  const m = {};
  S.data.absen.forEach((a) => {
    if (a.status === 'DIBATALKAN' || a.tanggal_mulai > tgl || a.tanggal_berakhir < tgl) return;
    if (set && !set.has(a.unit_id)) return;
    m[a.pengguna_id] = a;
  });
  return m;
}
function coversOn(tgl, units) {
  const set = new Set(units);
  return S.data.cover.filter((k) => k.tanggal === tgl && set.has(k.unit_id) && !(S.idx.absen[k.absen_id] && S.idx.absen[k.absen_id].status === 'DIBATALKAN'))
    .sort((a, b) => Number((S.idx.jam[a.jam_awal_id] || {}).urutan) - Number((S.idx.jam[b.jam_awal_id] || {}).urutan));
}
function jamInfo(k) {
  const a = S.idx.jam[k.jam_awal_id] || {}, b = S.idx.jam[k.jam_akhir_id] || a;
  const u1 = Number(a.urutan || 0), u2 = Number(b.urutan || u1);
  return { label: u1 === u2 ? `Jam ${u1}` : `Jam ${u1}-${u2}`, mulai: a.mulai || '', selesai: b.selesai || '', jp: Math.max(1, u2 - u1 + 1) };
}
function kelasName(id) { return (S.idx.kelas[id] || {}).nama_kelas || '—'; }
function termOf(tgl) { return S.master.term.find((t) => tgl >= t.tanggal_mulai && tgl <= t.tanggal_selesai); }
function termAktif() { return S.idx.term[S.app.termAktif] || termOf(S.today) || S.master.term[0] || {}; }

function jenisChip(a, compact) {
  if (!a) return `<span class="chip hadir">${ico('check_circle')} Hadir</span>`;
  if (a.jenis === 'SAKIT') return `<span class="chip sakit">${ico('medical_services')} Sakit</span>`;
  if (a.jenis === 'ALFA') return `<span class="chip alfa">${ico('help')} Alfa</span>`;
  if (a.sub_izin === 'TUGAS_SEKOLAH') return `<span class="chip izin-tugas">${ico('school')} ${compact ? 'Tugas Sekolah' : 'Izin · Tugas Sekolah'}</span>`;
  return `<span class="chip izin">${ico('event_busy')} ${compact ? 'Izin Pribadi' : 'Izin · Pribadi'}</span>`;
}
function coverChip(k) {
  if (k.status === 'SELESAI') return `<span class="chip selesai">${ico('check')} Selesai</span>`;
  if (k.status === 'DITUGASKAN') return `<span class="chip cover">${ico('swap_horiz')} Ditugaskan</span>`;
  return `<span class="chip belum">${ico('error')} Belum Ditugaskan</span>`;
}
function avatar(id, n, cls) { return `<span class="avatar ${cls || ''} ${avCls(id)}" aria-hidden="true">${esc(initials(n))}</span>`; }
function pending(row) { return row && row._pending ? ` <span class="spin" style="width:12px;height:12px;color:var(--primary)" title="Menyinkronkan"></span>` : ''; }
function emptyState(icon, title, sub) { return `<div class="empty">${ico(icon)}<b>${esc(title)}</b>${sub ? esc(sub) : ''}</div>`; }

// ════════════════════════════════════════════════════════════════════════════
// 3. UI DASAR: toast, modal, konfirmasi, drawer, tema
// ════════════════════════════════════════════════════════════════════════════
function toast(type, title, msg, opt) {
  opt = opt || {};
  const icons = { ok: 'check_circle', err: 'error', warn: 'warning', info: 'info' };
  const el = document.createElement('div');
  el.className = `toast-la ${type}`;
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.innerHTML = `${ico(icons[type] || 'info')}<div style="flex:1;min-width:0"><b>${esc(title)}</b>${msg ? `<div>${esc(msg)}</div>` : ''}</div>${opt.action ? `<button class="undo" type="button">${esc(opt.action)}</button>` : ''}`;
  if (opt.action) $('.undo', el).onclick = () => { opt.onAction && opt.onAction(); close(); };
  $('#toastStack').appendChild(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  setTimeout(close, opt.ms || (type === 'err' ? 6500 : 3500));
}

let modalInst = null, modalOnHide = null;
function modal(o) {
  const dlg = $('#modalMainDialog');
  dlg.className = `modal-dialog modal-dialog-centered modal-dialog-scrollable ${o.size ? 'modal-' + o.size : ''}`;
  $('#modalMainTitle').textContent = o.title || '';
  $('#modalMainSub').textContent = o.sub || '';
  $('#modalMainIcon').className = `stat-ico ${o.iconCls || 'ico-primary'}`;
  $('#modalMainIcon').innerHTML = ico(o.icon || 'edit_note');
  $('#modalMainBody').innerHTML = o.body || '';
  $('#modalMainFoot').innerHTML = o.foot || '';
  $('#modalMainFoot').style.display = o.foot ? '' : 'none';
  modalOnHide = o.onHide || null;
  modalInst = bootstrap.Modal.getOrCreateInstance($('#modalMain'));
  modalInst.show();
  if (o.onShow) setTimeout(o.onShow, 30);
}
function closeModal() { if (modalInst) modalInst.hide(); }

function confirmDlg(o) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title: o.title, icon: o.icon || (o.danger ? 'warning' : 'help'), iconCls: o.danger ? 'ico-sakit' : 'ico-primary', size: 'md',
      body: `<p class="mb-0" style="font-size:15px">${o.html || esc(o.msg)}</p>`,
      foot: `<button class="btn-la btn-ghost" data-bs-dismiss="modal">Batal</button><button class="btn-la ${o.danger ? 'btn-danger-soft' : 'btn-primary-la'}" id="cfOk">${esc(o.ok || 'Ya, lanjutkan')}</button>`,
      onShow: () => { $('#cfOk').onclick = () => { done = true; closeModal(); resolve(true); }; },
      onHide: () => { if (!done) resolve(false); }
    });
  });
}

/**
 * Form modal generik. fields: [{k,l,type,opts,req,help,ph,readonly,col}]
 * onSubmit(values) dipanggil setelah validasi; boleh mengembalikan false untuk menahan modal.
 */
function formModal(o) {
  const v = o.values || {};
  const f = (fd) => {
    const val = v[fd.k] == null ? (fd.def == null ? '' : fd.def) : v[fd.k];
    const id = 'fm_' + fd.k;
    const req = fd.req ? ' required' : '';
    const ro = fd.readonly ? ' readonly disabled' : '';
    let input;
    if (fd.type === 'select') input = `<select class="select-la" id="${id}" name="${fd.k}"${req}${ro}>${fd.ph !== false ? `<option value="">${esc(fd.ph || '— Pilih —')}</option>` : ''}${(fd.opts || []).map((op) => `<option value="${esc(op.v)}" ${String(op.v) === String(val) ? 'selected' : ''}>${esc(op.l)}</option>`).join('')}</select>`;
    else if (fd.type === 'textarea') input = `<textarea class="textarea-la" id="${id}" name="${fd.k}" placeholder="${esc(fd.ph || '')}"${req}${ro}>${esc(val)}</textarea>`;
    else if (fd.type === 'bool') input = `<label class="check-la"><span class="switch-la"><input type="checkbox" id="${id}" name="${fd.k}" ${isOn(val) ? 'checked' : ''}${ro}><span></span></span><span>${esc(fd.cap || 'Aktif')}</span></label>`;
    else input = `<input class="input-la" type="${fd.type || 'text'}" id="${id}" name="${fd.k}" value="${esc(val)}" placeholder="${esc(fd.ph || '')}"${fd.min != null ? ` min="${fd.min}"` : ''}${fd.max != null ? ` max="${fd.max}"` : ''}${req}${ro}>`;
    return `<div class="${fd.col || 'col-12'}">${fd.type === 'bool' ? '' : `<label class="form-label-la" for="${id}">${esc(fd.l)}${fd.req ? ' <span class="req">*</span>' : ''}</label>`}${input}<div class="field-err">${esc(fd.err || 'Wajib diisi.')}</div>${fd.help ? `<div class="help">${esc(fd.help)}</div>` : ''}</div>`;
  };
  modal({
    title: o.title, sub: o.sub, icon: o.icon, iconCls: o.iconCls, size: o.size || 'lg',
    body: `<form id="fmForm" novalidate><div class="row g-3">${(o.fields || []).map(f).join('')}</div>${o.extra || ''}</form>`,
    foot: `<button class="btn-la btn-ghost" type="button" data-bs-dismiss="modal">Batal</button><button class="btn-la btn-primary-la" type="submit" form="fmForm">${ico(o.okIcon || 'check')} ${esc(o.ok || 'Simpan')}</button>`,
    onShow: () => {
      const form = $('#fmForm');
      const first = $('input:not([disabled]),select:not([disabled]),textarea:not([disabled])', form);
      if (first && window.innerWidth > 768) first.focus();
      form.onsubmit = (e) => {
        e.preventDefault();
        let ok = true;
        const out = {};
        (o.fields || []).forEach((fd) => {
          const el = $('#fm_' + fd.k);
          if (!el) return;
          const val = fd.type === 'bool' ? el.checked : el.value.trim();
          out[fd.k] = val;
          const bad = (fd.req && !val && fd.type !== 'bool') || (fd.valid && val && !fd.valid(val, out));
          el.classList.toggle('is-invalid', !!bad);
          if (bad) ok = false;
        });
        if (!ok) { const bad = $('.is-invalid', form); if (bad) bad.focus(); return; }
        const r = o.onSubmit(out);
        if (r !== false) closeModal();
      };
      if (o.onShow) o.onShow();
    }
  });
}

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  ls.set('theme', t); try { localStorage.setItem('la_theme', t); } catch (e) { /* abaikan */ }
  $('#themeIco').textContent = t === 'dark' ? 'light_mode' : 'dark_mode';
  Object.values(S.charts).forEach((c) => { try { c.destroy(); } catch (e) { /* abaikan */ } });
  S.charts = {};
  if (!$('#appRoot').hidden) render(S.page);
}

function openDrawer() { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); }
function closeDrawer() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); }

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.target = '_self'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function downloadCSV(rows, name) {
  const csv = rows.map((r) => r.map((c) => { const s = String(c == null ? '' : c); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\r\n');
  downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), name);
}
function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mime: file.type, size: file.size, data: String(r.result).split(',')[1] });
    r.onerror = () => reject(new Error('Gagal membaca berkas.'));
    r.readAsDataURL(file);
  });
}
function checkFile(file, maxMB, types) {
  if (!file) return 'Pilih berkas terlebih dahulu.';
  if (!types.includes(file.type)) return 'Format berkas harus ' + (types.length === 1 ? 'PDF' : 'PDF, JPG, atau PNG') + '.';
  if (file.size > maxMB * 1048576) return `Ukuran berkas maksimal ${maxMB} MB.`;
  return '';
}
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${esc(label || 'Memproses…')}`; }
  else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. NAVIGASI SPA (tanpa URL, aman di iframe)
// ════════════════════════════════════════════════════════════════════════════
const PAGES = {
  beranda: { t: 'Beranda', i: 'grid_view' },
  kehadiran: { t: 'Kehadiran', i: 'checklist_rtl' },
  input: { t: 'Input Ketidakhadiran', i: 'edit_calendar' },
  cover: { t: 'Cover Lesson', i: 'swap_horiz' },
  tugas: { t: 'Tugas Piket Saya', i: 'assignment_ind' },
  jadwal: { t: 'Jadwal Term', i: 'calendar_month' },
  rekap: { t: 'Rekap Guru', i: 'query_stats' },
  admin: { t: 'Pengguna & Peran', i: 'manage_accounts' }
};

function hasPiketTask() {
  const me = S.me.id_pengguna, t = S.today;
  return S.data.piket.some((p) => p.pengguna_id === me && p.tanggal === t) || S.data.cover.some((k) => k.guru_piket_id === me && k.tanggal >= t);
}
function menuItems() {
  const p = S.perm, m = [];
  m.push('beranda');
  if (p.lihat_kehadiran && !isDiri()) m.push('kehadiran');
  if (p.input_absen || p.input_sakit_sendiri) m.push('input');
  if (p.kelola_cover || (p.lihat_kehadiran && !isDiri())) m.push('cover');
  if (hasPiketTask()) m.push('tugas');
  m.push('jadwal');
  if (p.lihat_rekap) m.push('rekap');
  return m;
}
function canOpen(page) {
  if (page === 'rekapDetail') return S.perm.lihat_rekap;
  if (page === 'admin') return S.perm.kelola_pengguna && !!S.admin;
  return menuItems().includes(page);
}

function renderNav() {
  const items = menuItems();
  const alfa = S.perm.ubah_alfa ? Object.values(absenAktifOn(S.today, activeUnits())).filter((a) => a.jenis === 'ALFA').length : 0;
  const belum = S.perm.kelola_cover ? coversOn(S.today, activeUnits()).filter((k) => k.status === 'BELUM_DITUGASKAN').length : 0;
  const tug = S.data.cover.filter((k) => k.guru_piket_id === S.me.id_pengguna && k.tanggal === S.today && k.status === 'DITUGASKAN').length;
  const badge = { kehadiran: alfa, cover: belum, tugas: tug };
  const label = (k) => (k === 'input' && !S.perm.input_absen ? 'Lapor Sakit' : PAGES[k].t);
  const link = (k) => `<li><button type="button" class="nav-link-la ${S.page === k || (k === 'rekap' && S.page === 'rekapDetail') ? 'active' : ''}" onclick="App.go('${k}')" ${S.page === k ? 'aria-current="page"' : ''} title="${esc(label(k))}">${ico(PAGES[k].i)}<span class="lbl">${esc(label(k))}</span>${badge[k] ? `<span class="badge-dot">${badge[k]}</span>` : ''}</button></li>`;
  let html = `<div class="nav-group">Manajemen Presensi</div><ul class="nav-list">${items.map(link).join('')}</ul>`;
  if (S.perm.kelola_pengguna && S.admin) html += `<div class="nav-group">Administrasi</div><ul class="nav-list">${link('admin')}</ul>`;
  $('#navList').innerHTML = html;

  // Navigasi bawah ponsel: maksimal 4 menu + "Menu"
  const prefer = ['beranda', 'kehadiran', 'input', 'cover', 'tugas', 'rekap', 'jadwal'];
  let bn = prefer.filter((k) => items.includes(k));
  if (isDiri()) bn = ['beranda', 'input', 'tugas', 'rekap', 'jadwal'].filter((k) => items.includes(k));
  else if (S.perm.input_absen) bn = ['beranda', 'kehadiran', 'cover', 'rekap', 'input'].filter((k) => items.includes(k));
  bn = bn.slice(0, 4);
  const short = { beranda: 'Beranda', kehadiran: 'Kehadiran', input: S.perm.input_absen ? 'Input' : 'Lapor', cover: 'Cover', tugas: 'Piket', rekap: 'Rekap', jadwal: 'Jadwal' };
  $('#bottomNav').innerHTML = bn.map((k) => `<button type="button" class="${S.page === k || (k === 'rekap' && S.page === 'rekapDetail') ? 'active' : ''}" onclick="App.go('${k}')" aria-label="${esc(PAGES[k].t)}">${ico(PAGES[k].i)}${esc(short[k])}${badge[k] ? `<span class="bdg">${badge[k]}</span>` : ''}</button>`).join('') +
    `<button type="button" onclick="App.openDrawer()" aria-label="Menu lainnya dan profil">${ico('person')}Profil</button>`;
}

function renderTopbar() {
  // Kontrol unit
  let unitHtml = '';
  if (isDiri()) unitHtml = S.me.unit_id ? `<span class="unit-lock"><span class="tag">${esc(S.me.unit_id)} ${ico('lock', 'sm')}</span>Data pribadi Anda</span>` : '';
  else if (!canAllUnits()) unitHtml = `<span class="unit-lock"><span class="tag">${esc(S.unit)} ${ico('lock', 'sm')}</span>Menampilkan unit ${esc(S.unit)} saja</span>`;
  else unitHtml = `<div class="unit-pills" role="tablist" aria-label="Filter unit">${[{ id: 'ALL', l: 'Semua Unit' }].concat(S.idx.unitList.map((u) => ({ id: u.unit_id, l: u.unit_id }))).map((u) => `<button type="button" role="tab" aria-selected="${S.unit === u.id}" class="${S.unit === u.id ? 'active' : ''}" onclick="App.setUnit('${u.id}')">${esc(u.l)}</button>`).join('')}</div>`;
  $('#unitCtl').innerHTML = unitHtml;
  const mob = $('#unitCtlMobile');
  mob.innerHTML = canAllUnits() && !isDiri() ? `<div style="overflow-x:auto">${unitHtml}</div>` : '';
  mob.style.display = mob.innerHTML && ['beranda', 'kehadiran', 'cover', 'rekap', 'jadwal'].includes(S.page) ? '' : 'none';

  // Kontrol tanggal (halaman harian)
  const daily = ['beranda', 'kehadiran', 'cover'].includes(S.page) && !isDiri();
  $('#dateCtl').innerHTML = daily ? `<label class="date-chip" title="Pilih tanggal tinjauan">${ico('calendar_today', 'sm')}<span class="desk-only">${esc(fmtLong(S.tanggal))}</span><span class="mobile-only" style="display:inline">${esc(fmtShort(S.tanggal))}</span>${S.tanggal === S.today ? '<span class="today-tag desk-only">Hari Ini</span>' : ''}<input type="date" value="${S.tanggal}" onchange="App.setDate(this.value)" aria-label="Tanggal tinjauan"></label>` : '';

  $('#notifWrap').style.display = S.data.notif && S.data.notif.length && !isDiri() ? '' : 'none';
  $('#notifDot').hidden = !S.data.notif.some((n) => n.waktu && n.waktu.slice(0, 10) === S.today);
  $('#topName').textContent = S.me.nama; $('#topRole').textContent = S.me.jabatan;
  $('#trayName').textContent = S.me.nama; $('#trayRole').textContent = S.me.jabatan;
  $('#themeIco').textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light_mode' : 'dark_mode';
  if (S.app.logo) $('#brandLogo').innerHTML = `<img src="${S.app.logo}" alt="Logo ${esc(S.app.sekolah)}">`;

  const sb = $('#simBanner');
  if (S.real.simulasi) { sb.hidden = false; sb.innerHTML = `${ico('visibility')} Mode simulasi: Anda melihat aplikasi sebagai <b>${esc(S.me.nama)}</b> (${esc(S.me.jabatan)}). Semua aksi tercatat atas nama pengguna ini.<button type="button" onclick="App.simulasi(null)">Keluar simulasi</button>`; }
  else sb.hidden = true;
}

function go(page, opt) {
  opt = opt || {};
  if (!canOpen(page)) page = 'beranda';
  if (page === 'rekapDetail' && opt.id) S.detailId = opt.id;
  S.page = page;
  ls.set('page', page);
  $$('.section-la').forEach((s) => s.classList.toggle('active', s.id === 'sec-' + page));
  closeDrawer();
  renderNav();
  renderTopbar();
  render(page);
  if (!opt.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function render(page) {
  const fn = { beranda: renderBeranda, kehadiran: renderKehadiran, input: renderInput, cover: renderCover, tugas: renderTugas, jadwal: renderJadwal, rekap: renderRekap, rekapDetail: renderRekapDetail, admin: renderAdmin }[page];
  try { if (fn) fn(); } catch (e) { console.error(e); $('#view-' + page).innerHTML = emptyState('bug_report', 'Gagal menampilkan halaman', e.message); }
}
/** Render ulang halaman aktif (kecuali formulir yang sedang diisi). */
function refreshView() { renderNav(); renderTopbar(); if (S.page !== 'input') render(S.page); }

// ════════════════════════════════════════════════════════════════════════════
// 5. BERANDA
// ════════════════════════════════════════════════════════════════════════════
function heroMeta() {
  const tr = termAktif();
  const ta = S.idx.tahun[tr.tahun_id] || {};
  const pekan = tr.tanggal_mulai ? Math.max(1, Math.floor(diffDays(tr.tanggal_mulai, S.tanggal) / 7) + 1) : '';
  return `<span class="pill"><span class="live"></span> Term ${esc(tr.nomor || '-')}${pekan ? ` · Pekan Akademik ${pekan}` : ''} • T.A. ${esc(ta.label || '-')}</span>
    <span class="pill info">${ico(S.app.notifAktif ? 'mark_email_read' : 'unsubscribe', 'sm')} Notifikasi Email ${S.app.notifAktif ? 'Aktif' : 'Nonaktif'}</span>`;
}

function dayStats(tgl, units) {
  const peg = pegawaiAktif(units);
  const abs = absenAktifOn(tgl, units);
  const list = peg.map((p) => ({ p, a: abs[p.id_pengguna] || null }));
  const s = { total: peg.length, sakit: 0, izinP: 0, izinT: 0, alfa: 0, berkas: 0, hk: units.some((u) => hariKerja(tgl, u)) };
  list.forEach(({ a }) => {
    if (!a) return;
    if (a.jenis === 'SAKIT') { s.sakit++; if (a.berkas_id) s.berkas++; }
    else if (a.jenis === 'ALFA') s.alfa++;
    else if (a.sub_izin === 'TUGAS_SEKOLAH') s.izinT++; else s.izinP++;
  });
  s.izin = s.izinP + s.izinT;
  s.absen = s.sakit + s.izin + s.alfa;
  s.hadir = s.total - s.absen;
  const cv = coversOn(tgl, units);
  s.cvTotal = cv.length; s.cvBelum = cv.filter((k) => k.status === 'BELUM_DITUGASKAN').length;
  s.cvTugas = cv.filter((k) => k.status === 'DITUGASKAN').length; s.cvSelesai = cv.filter((k) => k.status === 'SELESAI').length;
  s.cvTerisi = s.cvTugas + s.cvSelesai;
  return { s, list, covers: cv };
}

function statCards(s) {
  const hadirPct = s.total ? s.hadir / s.total * 100 : 0;
  return `<div class="row g-3 mb-4">
    <div class="col-6 col-lg"><div class="card-la stat-card hoverable"><div class="stat-top">Hadir Hari Ini<span class="stat-ico ico-hadir">${ico('task_alt')}</span></div>
      <div class="stat-value">${s.hadir}<span class="chip hadir">${pct(s.hadir, s.total)}</span></div>
      <div class="bar"><i style="width:${hadirPct.toFixed(1)}%"></i></div><div class="stat-foot">${s.hadir} dari ${s.total} staf aktif ${esc(unitLabel())}</div></div></div>
    <div class="col-6 col-lg"><div class="card-la stat-card hoverable"><div class="stat-top">Sakit<span class="stat-ico ico-sakit">${ico('medical_services')}</span></div>
      <div class="stat-value">${s.sakit}${s.berkas ? `<span class="chip sakit">${s.berkas} Lampiran Surat</span>` : ''}</div>
      <div class="stat-foot">${s.sakit ? 'Dalam rehat & perawatan medis' : 'Tidak ada laporan sakit'}</div></div></div>
    <div class="col-6 col-lg"><div class="card-la stat-card hoverable"><div class="stat-top">Izin Terdata<span class="stat-ico ico-izin">${ico('event_note')}</span></div>
      <div class="stat-value">${s.izin}</div>
      <div class="stat-foot"><div class="d-flex justify-content-between"><span><span class="dot-c" style="background:var(--izin-line)"></span> Izin · Pribadi</span><b class="text-strong">${s.izinP}</b></div>
      <div class="d-flex justify-content-between"><span><span class="dot-c" style="background:#D97706"></span> Izin · Tugas Sekolah</span><b class="text-strong">${s.izinT}</b></div></div></div></div>
    <div class="col-6 col-lg"><div class="card-la stat-card hoverable ${s.alfa ? 'attn' : ''}"><div class="stat-top">Alfa / Tanpa Keterangan<span class="stat-ico ico-alfa">${ico('priority_high')}</span></div>
      <div class="stat-value">${s.alfa}${s.alfa ? '<span class="chip alfa">Perlu Tindakan</span>' : ''}</div>
      <div class="stat-foot">${s.alfa ? (S.perm.ubah_alfa ? '<button class="btn-link-la p-0" onclick="App.go(\'kehadiran\');App.filterKeh(\'ALFA\')">Tinjau &amp; ubah status ' + ico('arrow_forward', 'sm') + '</button>' : 'Menunggu konfirmasi Kepala Sekolah') : 'Semua ketidakhadiran berketerangan'}</div></div></div>
    <div class="col-12 col-lg"><div class="card-la stat-card hoverable"><div class="stat-top">Cover Lesson<span class="stat-ico ico-cover">${ico('swap_horiz')}</span></div>
      <div class="stat-value" style="color:var(--cover)">${s.cvTerisi} / ${s.cvTotal}<span class="chip cover">${s.cvTotal ? pct(s.cvTerisi, s.cvTotal, 0) : '—'} Slot</span></div>
      <div class="bar cover thick"><i style="width:${s.cvTotal ? s.cvTerisi / s.cvTotal * 100 : 0}%"></i></div>
      <div class="stat-foot">${!s.cvTotal ? 'Tidak ada kelas ditinggalkan' : s.cvBelum ? `<span style="color:var(--izin-fg);font-weight:600">${ico('error', 'sm')} ${s.cvBelum} slot belum ditugaskan</span>` : `<span style="color:var(--ok-fg);font-weight:600">${ico('verified', 'sm')} Semua kelas aman terisi</span>`}</div></div></div>
  </div>`;
}

function renderBeranda() {
  if (isDiri()) return renderBerandaGuru();
  const units = activeUnits();
  const { s, list, covers } = dayStats(S.tanggal, units);
  const absent = list.filter((x) => x.a);
  const ta = S.idx.tahun[termAktif().tahun_id] || {};
  const nm = S.me.peranKode === 'KEPSEK' ? `${S.me.jabatan}` : shortName(S.me.nama);

  // Ringkasan per unit (atau per jenis pegawai bila satu unit)
  let breakdown;
  if (units.length > 1) {
    breakdown = units.map((u) => {
      const st = dayStats(S.tanggal, [u]).s;
      const un = S.idx.unit[u] || {};
      return { k: u, l: `${u} · ${un.setara || ''}`, sub: un.nama_lengkap, a: st.hadir, b: st.total };
    });
  } else {
    const by = {};
    list.forEach(({ p, a }) => { const j = (S.idx.jenis[p.jenis_id] || {}).nama || 'Lainnya'; by[j] = by[j] || { a: 0, b: 0 }; by[j].b++; if (!a) by[j].a++; });
    breakdown = Object.keys(by).map((k) => ({ k, l: k, sub: 'Jenis pegawai', a: by[k].a, b: by[k].b }));
  }
  const colors = ['var(--primary-strong)', 'var(--primary)', 'var(--cover)', 'var(--ok)', 'var(--izin)'];

  const q = S.ui.ber.q.toLowerCase(), st = S.ui.ber.st;
  const rows = absent.filter(({ p, a }) => (!q || p.nama.toLowerCase().includes(q)) && (!st || a.jenis === st))
    .sort((x, y) => ['ALFA', 'SAKIT', 'IZIN'].indexOf(x.a.jenis) - ['ALFA', 'SAKIT', 'IZIN'].indexOf(y.a.jenis));

  const notif = (S.data.notif || []).slice(-3).reverse();
  const hariLibur = !s.hk;

  $('#view-beranda').innerHTML = `
    <div class="hero mb-4">
      <div class="hero-meta">${heroMeta()}</div>
      <h1>${salam()}, ${esc(nm)}!</h1>
      <p>Ringkasan ketersediaan <b>${s.total} staf</b> ${esc(units.length > 1 ? 'di semua unit' : (S.idx.unit[units[0]] || {}).nama_lengkap || units[0])} Tahun Ajaran ${esc(ta.label || '-')} per <b>${esc(fmtLong(S.tanggal))}</b>.</p>
      ${hariLibur ? `<div class="info-box warn mt-3">${ico('beach_access')}<div>Tanggal ini adalah akhir pekan / hari libur — tidak dihitung sebagai hari kerja.</div></div>` : ''}
    </div>
    ${statCards(s)}
    <div class="row g-3 mb-4">
      <div class="col-lg-4">
        <div class="card-la card-pad h-100">
          <div class="card-head"><div><h2>Distribusi Presensi</h2><p>${units.length > 1 ? 'Kehadiran staf per unit sekolah' : 'Kehadiran staf per jenis pegawai'}</p></div></div>
          <div class="donut-wrap"><canvas id="chDonut" aria-label="Diagram distribusi presensi" role="img"></canvas>
            <div class="donut-center"><b>${s.total}</b><span>Total Staf</span><em>${s.hadir} Hadir</em></div></div>
          ${breakdown.map((b, i) => `<div class="legend-row"><span class="dot-c" style="background:${colors[i % colors.length]}"></span><div class="lb"><b>${esc(b.l)}</b><small>${esc(b.sub || '')}</small></div><div class="vl">${b.a} / ${b.b}<small>${pct(b.a, b.b)}</small></div></div>`).join('')}
        </div>
      </div>
      <div class="col-lg-8 d-flex flex-column gap-3">
        <div class="card-la card-pad">
          <div class="card-head"><div><h2>Status Guru Pengganti (Cover Lesson)</h2><p>${esc(units.length > 1 ? 'Semua unit' : (S.idx.unit[units[0]] || {}).nama_lengkap || '')} • ${esc(fmtLong(S.tanggal))}</p></div>
            <button class="btn-link-la" onclick="App.go('cover')">Buka Matriks Lengkap ${ico('arrow_forward', 'sm')}</button></div>
          ${covers.length ? `<div class="row g-3">${covers.slice(0, 6).map((k) => { const j = jamInfo(k); return `<div class="col-sm-6 col-xl-4"><div class="mini-slot">
              <div class="d-flex justify-content-between gap-2 align-items-start"><span class="tm">Jam ${esc(j.mulai)} - ${esc(j.selesai)}</span>${k.status === 'SELESAI' ? '<span class="chip selesai">Terselesaikan</span>' : k.status === 'DITUGASKAN' ? '<span class="chip cover">Ditugaskan</span>' : '<span class="chip belum">Belum</span>'}</div>
              <b>Kelas ${esc(kelasName(k.kelas_id))} (${esc(k.mata_pelajaran)})</b>
              <small class="muted">Guru Absen: <span style="color:var(--sick-fg)">${esc(nama(k.guru_utama_id))}</span></small>
              ${k.guru_piket_id ? `<span class="cv">${ico('swap_horiz', 'sm')} Dicover: ${esc(nama(k.guru_piket_id))}</span>` : `<span class="cv" style="color:var(--izin-fg)">${ico('person_alert', 'sm')} Menunggu guru piket</span>`}
            </div></div>`; }).join('')}</div>` : emptyState('event_available', 'Tidak ada kelas yang ditinggalkan', 'Semua jadwal mengajar berjalan normal.')}
        </div>
        <div class="card-la card-pad">
          <div class="card-head"><div><h2>${ico('forward_to_inbox', 'lg')} Log Notifikasi Email</h2></div><span class="small-xs muted fw-semibold">${S.app.notifAktif ? 'Otomatis via Gmail' : 'Notifikasi dimatikan Admin'}</span></div>
          ${notif.length ? notif.map((n) => `<div class="notif-row">${ico(n.jenis === 'ABSEN_BARU' ? 'mail' : 'outgoing_mail')}<div style="flex:1;min-width:0"><b>${esc(n.subjek.replace('[LEARNING ACTIVITY] ', ''))}</b><small>${esc(n.penerima)} • ${esc(fmtDT(n.waktu))}</small></div>${n.status === 'TERKIRIM' ? '<span class="chip selesai">Terkirim</span>' : n.status === 'GAGAL' ? '<span class="chip gagal">Gagal</span>' : '<span class="chip antri">Antre</span>'}</div>`).join('') : emptyState('drafts', 'Belum ada notifikasi', '')}
        </div>
      </div>
    </div>
    <div class="card-la">
      <div class="card-pad pb-3 d-flex flex-wrap gap-3 align-items-end justify-content-between">
        <div><h2 class="d-flex align-items-center gap-2">Kehadiran Hari Ini <span class="chip unit">${esc(S.unit === 'ALL' ? 'Semua Unit' : (S.idx.unit[S.unit] || {}).nama_lengkap || S.unit)}</span></h2>
          <p class="muted mb-0 mt-1">Daftar staf dengan ketidakhadiran, status izin, atau yang perlu penyesuaian.</p></div>
        <div class="d-flex flex-wrap gap-2 no-print">
          <div class="search-box" style="min-width:220px">${ico('search')}<input class="input-la" placeholder="Cari nama pegawai…" value="${esc(S.ui.ber.q)}" oninput="App.berSearch(this.value)" aria-label="Cari nama pegawai"></div>
          <select class="select-la" style="width:auto" onchange="App.berStatus(this.value)" aria-label="Filter status"><option value="">Semua Status</option>${['SAKIT', 'IZIN', 'ALFA'].map((x) => `<option value="${x}" ${st === x ? 'selected' : ''}>${x === 'SAKIT' ? 'Sakit' : x === 'IZIN' ? 'Izin' : 'Alfa'}</option>`).join('')}</select>
          <button class="btn-la btn-primary-la" onclick="App.exportHarian()">${ico('download')} Unduh Rekap</button>
        </div>
      </div>
      <div class="table-wrap px-2 pb-2">${absenTable(rows, true)}</div>
      <div class="px-4 py-3 small-xs muted">Menampilkan ${rows.length} catatan ketidakhadiran dari ${s.total} staf aktif.</div>
    </div>
    <div class="insight mt-4">${ico('lightbulb')}<div><b>Ringkasan otomatis:</b> ${esc(autoInsight(s))}</div></div>`;

  drawDonut('chDonut', breakdown.map((b) => b.l), breakdown.map((b) => b.a), [s.total - s.hadir], colors);
}

function autoInsight(s) {
  if (!s.hk) return 'Hari ini bukan hari kerja.';
  const parts = [];
  parts.push(`Tingkat kehadiran ${pct(s.hadir, s.total)} (${s.hadir} dari ${s.total} staf).`);
  if (s.alfa) parts.push(`${s.alfa} staf berstatus alfa dan perlu konfirmasi.`);
  if (s.cvBelum) parts.push(`${s.cvBelum} slot kelas belum memiliki guru pengganti — segera tugaskan dari jadwal piket.`);
  else if (s.cvTotal) parts.push('Seluruh kelas yang ditinggalkan sudah memiliki guru pengganti.');
  const pt = S.app.target;
  if (s.total && s.hadir / s.total * 100 < pt) parts.push(`Kehadiran di bawah target institusi (≥${pt}%).`);
  return parts.join(' ');
}

/** Tabel ketidakhadiran (dipakai Beranda). */
function absenTable(rows, withPiket) {
  if (!rows.length) return emptyState('celebration', 'Tidak ada ketidakhadiran', 'Seluruh staf tercatat hadir pada tanggal ini.');
  return `<table class="table-la table-cards"><thead><tr><th>Nama Pegawai &amp; Peran</th><th>Kategori &amp; Status</th><th>Keterangan / Alasan</th><th>Kelas Ditinggalkan</th>${withPiket ? '<th>Guru Piket</th>' : ''}<th class="text-end">Aksi</th></tr></thead><tbody>
    ${rows.map(({ p, a }) => {
      const cv = (S.idx.coverByAbsen[a.absen_id] || []).filter((k) => k.tanggal === S.tanggal);
      const piket = [...new Set(cv.map((k) => k.guru_piket_id).filter(Boolean))].map(nama);
      return `<tr>
        <td class="td-main"><div class="person">${avatar(p.id_pengguna, p.nama)}<div><div class="nm">${esc(p.nama)}${pending(a)}</div><div class="sub">${esc(p.unit_id)} - ${esc(p.bidang_studi || p.jabatan || '')}</div></div></div></td>
        <td data-label="Status">${jenisChip(a)}</td>
        <td data-label="Alasan" style="max-width:280px"><div style="color:var(--text)">${esc(a.alasan)}</div>${a.berkas_id ? `<button class="file-link" onclick="App.preview('${esc(a.berkas_id)}')">${ico('attach_file', 'sm')} Lihat berkas</button>` : ''}${a.tanggal_berakhir !== a.tanggal_mulai ? `<div class="small-xs muted">${fmtShort(a.tanggal_mulai)} – ${fmtShort(a.tanggal_berakhir)}</div>` : ''}</td>
        <td data-label="Kelas">${cv.length ? cv.map((k) => `<span class="cell-tag me-1 mb-1">${esc(kelasName(k.kelas_id))} (${esc(jamInfo(k).label)})</span>`).join('') : '<span class="muted">—</span>'}</td>
        ${withPiket ? `<td data-label="Guru Piket">${piket.length ? esc(piket.join(', ')) : cv.length ? '<span class="chip belum">Belum</span>' : '<span class="muted">—</span>'}</td>` : ''}
        <td data-label="Aksi" class="text-end">${rowActions(a)}</td></tr>`;
    }).join('')}</tbody></table>`;
}

function rowActions(a) {
  const btns = [];
  if (a.jenis === 'ALFA' && S.perm.ubah_alfa && !a._pending) btns.push(`<button class="btn-la btn-primary-la btn-sm-la" onclick="App.ubahStatus('${a.absen_id}')">${ico('edit', 'sm')} Ubah Status</button>`);
  btns.push(`<button class="icon-btn" onclick="App.detailAbsen('${a.absen_id}')" aria-label="Lihat detail">${ico('visibility')}</button>`);
  return `<div class="d-inline-flex gap-1 align-items-center">${btns.join('')}</div>`;
}

/** Beranda untuk Guru (ringkasan pribadi). */
function renderBerandaGuru() {
  const me = S.me, tr = termAktif();
  const mine = S.data.absen.filter((a) => a.pengguna_id === me.id_pengguna && a.status !== 'DIBATALKAN');
  const inTerm = mine.filter((a) => a.tanggal_berakhir >= tr.tanggal_mulai && a.tanggal_mulai <= tr.tanggal_selesai);
  const hk = countHK(tr.tanggal_mulai || S.today, S.today < (tr.tanggal_selesai || S.today) ? S.today : tr.tanggal_selesai, me.unit_id);
  let sakit = 0, izin = 0, alfa = 0;
  inTerm.forEach((a) => {
    const from = a.tanggal_mulai < tr.tanggal_mulai ? tr.tanggal_mulai : a.tanggal_mulai;
    const to = a.tanggal_berakhir > tr.tanggal_selesai ? tr.tanggal_selesai : a.tanggal_berakhir;
    const n = countHK(from, to, me.unit_id);
    if (a.jenis === 'SAKIT') sakit += n; else if (a.jenis === 'ALFA') alfa += n; else izin += n;
  });
  const absenHari = sakit + izin + alfa;
  const today = absenAktifOn(S.today, null)[me.id_pengguna];
  const tugas = S.data.cover.filter((k) => k.guru_piket_id === me.id_pengguna && k.tanggal >= S.today).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const piketNext = S.data.piket.filter((p) => p.pengguna_id === me.id_pengguna && p.tanggal >= S.today).sort((a, b) => a.tanggal.localeCompare(b.tanggal)).slice(0, 5);
  const ta = S.idx.tahun[tr.tahun_id] || {};

  $('#view-beranda').innerHTML = `
    <div class="hero mb-4">
      <div class="hero-meta">${heroMeta()}</div>
      <h1>${salam()}, ${esc(shortName(me.nama))}!</h1>
      <p>${esc(me.bidang_studi || '')} · Unit ${esc(me.unit_id)} — status Anda hari ini: ${today ? jenisChip(today) : '<span class="chip hadir">' + ico('check_circle') + ' Hadir</span>'}</p>
      <div class="d-flex flex-wrap gap-2 mt-3">
        ${S.perm.input_sakit_sendiri ? `<button class="btn-la btn-primary-la" onclick="App.go('input')">${ico('sick')} Lapor Sakit</button>` : ''}
        ${hasPiketTask() ? `<button class="btn-la btn-cover" onclick="App.go('tugas')">${ico('assignment_ind')} Tugas Piket Saya</button>` : ''}
        ${S.perm.lihat_rekap ? `<button class="btn-la btn-soft" onclick="App.go('rekap')">${ico('query_stats')} Rekap Saya</button>` : ''}
      </div>
    </div>
    <div class="row g-3 mb-4">
      <div class="col-6 col-lg-3"><div class="card-la stat-card"><div class="stat-top">Tingkat Kehadiran<span class="stat-ico ico-hadir">${ico('how_to_reg')}</span></div><div class="stat-value">${hk ? pct(hk - absenHari, hk) : '—'}</div><div class="bar"><i style="width:${hk ? (hk - absenHari) / hk * 100 : 0}%"></i></div><div class="stat-foot">Term ${esc(tr.nomor || '')} · ${hk} hari kerja</div></div></div>
      <div class="col-6 col-lg-3"><div class="card-la stat-card"><div class="stat-top">Hari Sakit<span class="stat-ico ico-sakit">${ico('medical_services')}</span></div><div class="stat-value">${sakit}<small>hari</small></div><div class="stat-foot">Term berjalan</div></div></div>
      <div class="col-6 col-lg-3"><div class="card-la stat-card"><div class="stat-top">Hari Izin<span class="stat-ico ico-izin">${ico('event_note')}</span></div><div class="stat-value">${izin}<small>hari</small></div><div class="stat-foot">Pribadi & tugas sekolah</div></div></div>
      <div class="col-6 col-lg-3"><div class="card-la stat-card"><div class="stat-top">Alfa<span class="stat-ico ico-alfa">${ico('shield')}</span></div><div class="stat-value">${alfa}<small>hari</small></div><div class="stat-foot">${alfa ? 'Hubungi Kepala Sekolah' : 'Bersih / disiplin tinggi'}</div></div></div>
    </div>
    <div class="row g-3">
      <div class="col-lg-7"><div class="card-la card-pad h-100"><div class="card-head"><div><h2>Riwayat Ketidakhadiran Saya</h2><p>T.A. ${esc(ta.label || '')}</p></div></div>
        ${mine.length ? mine.slice().sort((a, b) => b.tanggal_mulai.localeCompare(a.tanggal_mulai)).slice(0, 8).map((a) => `<div class="notif-row" style="cursor:pointer" onclick="App.detailAbsen('${a.absen_id}')">${ico('event')}<div style="flex:1;min-width:0"><b>${esc(fmtLong(a.tanggal_mulai))}${a.tanggal_berakhir !== a.tanggal_mulai ? ' – ' + esc(fmtShort(a.tanggal_berakhir)) : ''}${pending(a)}</b><small>${esc(a.alasan)}</small></div>${jenisChip(a, true)}</div>`).join('') : emptyState('verified', 'Belum ada catatan ketidakhadiran', 'Pertahankan kehadiran Anda!')}
      </div></div>
      <div class="col-lg-5"><div class="card-la card-pad h-100"><div class="card-head"><div><h2>Jadwal Piket Saya</h2><p>Ditetapkan Admin</p></div>${hasPiketTask() ? `<button class="btn-link-la" onclick="App.go('tugas')">Buka ${ico('arrow_forward', 'sm')}</button>` : ''}</div>
        ${piketNext.length ? piketNext.map((p) => { const n = tugas.filter((k) => k.tanggal === p.tanggal).length; return `<div class="piket-item" style="background:var(--surface-tint)"><div><b>${esc(fmtLong(p.tanggal))}</b><small>Shift ${p.shift === 'SIANG' ? 'Siang' : 'Pagi'} · Unit ${esc(p.unit_id)}</small></div>${n ? `<span class="chip cover">${n} tugas</span>` : '<span class="chip neutral">Siaga</span>'}</div>`; }).join('') : emptyState('event_available', 'Tidak ada jadwal piket mendatang', '')}
      </div></div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// 6. GRAFIK (Chart.js dimuat async; menggambar saat siap)
// ════════════════════════════════════════════════════════════════════════════
const chartQueue = [];
function whenChart(fn) { if (window.Chart) fn(); else chartQueue.push(fn); }
function drawDonut(id, labels, values, rest, colors) {
  whenChart(() => {
    const el = document.getElementById(id); if (!el) return;
    if (S.charts[id]) S.charts[id].destroy();
    const col = colors.map((c) => (c.startsWith('var(') ? cssVar(c.slice(4, -1)) : c));
    const absent = rest[0] || 0;
    S.charts[id] = new Chart(el, {
      type: 'doughnut',
      data: { labels: labels.concat(absent ? ['Tidak hadir'] : []), datasets: [{ data: values.concat(absent ? [absent] : []), backgroundColor: col.slice(0, values.length).concat(absent ? [cssVar('--surface-tint-2')] : []), borderWidth: 0, borderRadius: 6, spacing: 2 }] },
      options: { cutout: '74%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw} staf` } } }, animation: { duration: 400 } }
    });
  });
}
function drawBars(id, labels, values, peakIdx) {
  whenChart(() => {
    const el = document.getElementById(id); if (!el) return;
    if (S.charts[id]) S.charts[id].destroy();
    const base = cssVar('--primary-strong'), peak = cssVar('--sick'), grid = cssVar('--border'), txt = cssVar('--muted');
    S.charts[id] = new Chart(el, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Hari ketidakhadiran', data: values, backgroundColor: values.map((_, i) => (i === peakIdx ? peak : base)), borderRadius: 8, maxBarThickness: 56 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.raw} hari ketidakhadiran` } } },
        scales: { x: { grid: { display: false }, ticks: { color: txt, font: { weight: 600 } } }, y: { beginAtZero: true, ticks: { precision: 0, color: txt }, grid: { color: grid } } }
      }
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 7. KEHADIRAN
// ════════════════════════════════════════════════════════════════════════════
function renderKehadiran() {
  const units = activeUnits();
  const { s, list } = dayStats(S.tanggal, units);
  const f = S.ui.keh;
  const q = f.q.toLowerCase();
  const order = { ALFA: 0, SAKIT: 1, IZIN: 2 };
  let rows = list.filter(({ p, a }) => {
    if (q && !(p.nama.toLowerCase().includes(q) || String(p.bidang_studi).toLowerCase().includes(q))) return false;
    if (f.jenis && p.jenis_id !== f.jenis) return false;
    if (f.st === 'HADIR') return !a;
    if (f.st) return a && a.jenis === f.st;
    return true;
  }).sort((x, y) => (x.a ? order[x.a.jenis] : 9) - (y.a ? order[y.a.jenis] : 9) || x.p.nama.localeCompare(y.p.nama));
  const size = 15, pages = Math.max(1, Math.ceil(rows.length / size));
  if (f.page > pages) f.page = pages;
  const view = rows.slice((f.page - 1) * size, f.page * size);

  const mini = (lbl, v, sub, cls, w) => `<div class="col-6 col-md"><div class="card-la stat-card"><div class="stat-top"><span class="eyebrow" style="color:${cls}">${lbl}</span></div><div class="stat-value" style="font-size:28px">${v}<small>${sub}</small></div><div class="bar"><i style="width:${w}%;background:${cls}"></i></div></div></div>`;

  $('#view-kehadiran').innerHTML = `
    <div class="page-head"><div><div class="crumbs">Presensi &amp; Jadwal <span class="msi sm">chevron_right</span> <b>Daftar Presensi</b></div>
      <h1>Daftar Presensi Guru &amp; Staf</h1><p>Monitoring kehadiran ${s.total} staf ${esc(unitLabel())} — ${esc(fmtLong(S.tanggal))}.</p></div>
      <div class="d-flex gap-2 flex-wrap no-print">
        ${S.perm.input_absen ? `<button class="btn-la btn-soft" onclick="App.go('input')">${ico('add')} Catat Ketidakhadiran</button>` : ''}
        <button class="btn-la btn-primary-la" onclick="App.exportHarian()">${ico('download')} Unduh Rekap Harian (CSV)</button></div></div>
    ${!s.hk ? `<div class="info-box warn mb-3">${ico('beach_access')}<div>Tanggal ini bukan hari kerja (akhir pekan / libur).</div></div>` : ''}
    <div class="row g-3 mb-4">
      ${mini('Total Staf', s.total, 'pendidik & staf', 'var(--primary-strong)', 100)}
      ${mini('Hadir', s.hadir, '/ ' + s.total + ' (' + pct(s.hadir, s.total) + ')', 'var(--ok)', s.total ? s.hadir / s.total * 100 : 0)}
      ${mini('Sakit', s.sakit, s.berkas + ' berkas', 'var(--sick)', s.total ? s.sakit / s.total * 100 : 0)}
      ${mini('Izin', s.izin, s.izinP + ' pribadi • ' + s.izinT + ' tugas', 'var(--izin)', s.total ? s.izin / s.total * 100 : 0)}
      ${mini('Alfa', s.alfa, s.alfa ? 'perlu tindakan' : 'aman', 'var(--alfa)', s.total ? s.alfa / s.total * 100 : 0)}
    </div>
    <div class="card-la card-pad py-3 mb-3 no-print"><div class="row g-2">
      <div class="col-md-5"><div class="search-box">${ico('search')}<input class="input-la" placeholder="Cari nama guru, bidang studi…" value="${esc(f.q)}" oninput="App.kehFilter('q', this.value)" aria-label="Cari"></div></div>
      <div class="col-6 col-md-3"><select class="select-la" onchange="App.kehFilter('st', this.value)" aria-label="Status"><option value="">Semua Status</option>${[['HADIR', 'Hadir'], ['SAKIT', 'Sakit'], ['IZIN', 'Izin'], ['ALFA', 'Alfa']].map(([v, l]) => `<option value="${v}" ${f.st === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="col-6 col-md-4"><select class="select-la" onchange="App.kehFilter('jenis', this.value)" aria-label="Jenis pegawai"><option value="">Semua Jenis Pegawai</option>${S.master.jenis.map((j) => `<option value="${esc(j.jenis_id)}" ${f.jenis === j.jenis_id ? 'selected' : ''}>${esc(j.nama)}</option>`).join('')}</select></div>
    </div></div>
    <div class="card-la">
      ${view.length ? `<div class="table-wrap p-2"><table class="table-la table-cards"><thead><tr><th>No</th><th>Nama Guru &amp; Bidang</th><th>Unit</th><th>Status Kehadiran</th><th>Kelas Ditinggalkan &amp; Cover</th><th>Dokumen Bukti</th><th class="text-end">Aksi</th></tr></thead><tbody>
        ${view.map(({ p, a }, i) => {
          const cv = a ? (S.idx.coverByAbsen[a.absen_id] || []).filter((k) => k.tanggal === S.tanggal) : [];
          return `<tr><td data-label="No" class="td-hide-m">${(f.page - 1) * size + i + 1}</td>
            <td class="td-main"><div class="person">${avatar(p.id_pengguna, p.nama)}<div><div class="nm">${esc(p.nama)}${pending(a)}</div><div class="sub">${esc(p.bidang_studi || p.jabatan || '')}</div></div></div></td>
            <td data-label="Unit"><span class="chip unit">${esc(p.unit_id || '—')}</span></td>
            <td data-label="Status">${jenisChip(a)}${a && a.cakupan === 'SEBAGIAN' ? '<div class="small-xs muted mt-1">Sebagian hari</div>' : ''}</td>
            <td data-label="Kelas">${cv.length ? cv.map((k) => `<div class="small-xs mb-1"><span style="color:${k.status === 'BELUM_DITUGASKAN' ? 'var(--sick-fg)' : 'var(--text)'};font-weight:600">${esc(kelasName(k.kelas_id))} (${esc(jamInfo(k).label)})</span><br>${k.guru_piket_id ? `<span style="color:var(--ok-fg)">Dicover: ${esc(nama(k.guru_piket_id))}</span>` : `<span style="color:var(--izin-fg)">${ico('warning', 'sm')} Belum ada guru cover</span>`}</div>`).join('') : `<span class="muted small-xs">${a ? 'Tidak ada kelas ditinggalkan' : '—'}</span>`}</td>
            <td data-label="Dokumen">${a && a.berkas_id ? `<button class="file-link" onclick="App.preview('${esc(a.berkas_id)}')">${ico('description', 'sm')} Lihat berkas</button>` : '<span class="muted">—</span>'}</td>
            <td data-label="Aksi" class="text-end">${a ? rowActions(a) : '<span class="muted">—</span>'}</td></tr>`;
        }).join('')}</tbody></table></div>
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 px-4 py-3"><span class="small-xs muted">Menampilkan ${(f.page - 1) * size + 1}–${(f.page - 1) * size + view.length} dari ${rows.length} staf</span>${pager(pages, f.page, 'App.kehPage')}</div>`
      : emptyState('person_search', 'Tidak ada data yang cocok', 'Ubah kata kunci atau filter.')}
    </div>`;
}

function pager(pages, cur, fn) {
  if (pages <= 1) return '';
  const btn = (n, l, dis) => `<button type="button" ${dis ? 'disabled' : ''} class="${n === cur && !l ? 'active' : ''}" onclick="${fn}(${n})" aria-label="Halaman ${n}">${l || n}</button>`;
  const arr = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - cur) <= 1) arr.push(i); else if (arr[arr.length - 1] !== '…') arr.push('…');
  return `<div class="pager">${btn(Math.max(1, cur - 1), ico('chevron_left', 'sm'), cur === 1)}${arr.map((n) => (n === '…' ? '<span class="muted px-1">…</span>' : btn(n))).join('')}${btn(Math.min(pages, cur + 1), ico('chevron_right', 'sm'), cur === pages)}</div>`;
}

function exportHarian() {
  const units = activeUnits();
  const { list } = dayStats(S.tanggal, units);
  const rows = [['Tanggal', 'Nama', 'Unit', 'Bidang', 'Status', 'Sub Izin', 'Alasan', 'Kelas Ditinggalkan', 'Guru Piket']];
  list.forEach(({ p, a }) => {
    const cv = a ? (S.idx.coverByAbsen[a.absen_id] || []).filter((k) => k.tanggal === S.tanggal) : [];
    rows.push([S.tanggal, p.nama, p.unit_id, p.bidang_studi, a ? a.jenis : 'HADIR', a ? a.sub_izin : '', a ? a.alasan : '', cv.map((k) => kelasName(k.kelas_id) + ' ' + jamInfo(k).label).join(', '), cv.map((k) => (k.guru_piket_id ? nama(k.guru_piket_id) : 'Belum')).join(', ')]);
  });
  downloadCSV(rows, `Rekap_Harian_${S.unit}_${S.tanggal}.csv`);
  toast('ok', 'Rekap harian diunduh', `${list.length} baris data.`);
}

// ── Detail & aksi ketidakhadiran ────────────────────────────────────────────
function detailAbsen(id) {
  const a = S.idx.absen[id];
  if (!a) return;
  const p = pegById(a.pengguna_id);
  const cv = S.idx.coverByAbsen[id] || [];
  const riw = (S.idx.riwayat[id] || []).slice().sort((x, y) => String(y.waktu).localeCompare(String(x.waktu)));
  const canCancel = S.perm.input_absen && a.status !== 'DIBATALKAN' && !a._pending;
  modal({
    title: p.nama || 'Detail Ketidakhadiran', sub: `${p.unit_id || ''} · ${p.bidang_studi || ''}`, icon: 'event_note', size: 'lg',
    body: `<div class="d-flex flex-wrap gap-2 mb-3">${jenisChip(a)}${a.status === 'DIBATALKAN' ? '<span class="chip arsip">Dibatalkan</span>' : ''}${a.cakupan === 'SEBAGIAN' ? '<span class="chip neutral">Sebagian hari</span>' : ''}</div>
      <div class="kv"><span>Tanggal</span><span>${esc(fmtLong(a.tanggal_mulai))}${a.tanggal_berakhir !== a.tanggal_mulai ? ' – ' + esc(fmtLong(a.tanggal_berakhir)) : ''} (${countHK(a.tanggal_mulai, a.tanggal_berakhir, a.unit_id)} hari kerja)</span></div>
      <div class="kv"><span>Keterangan</span><span>${esc(a.alasan)}</span></div>
      <div class="kv"><span>Berkas pendukung</span><span>${a.berkas_id ? `<button class="file-link" onclick="App.preview('${esc(a.berkas_id)}')">${ico('description', 'sm')} Pratinjau</button>` : '—'}</span></div>
      <div class="kv"><span>Dicatat oleh</span><span>${esc(nama(a.dicatat_oleh))} · ${esc(fmtDT(a.dicatat_pada))}</span></div>
      <h3 class="mt-4 mb-2">Kelas yang Ditinggalkan</h3>
      ${cv.length ? cv.map((k) => { const j = jamInfo(k); return `<div class="notif-row">${ico('class')}<div style="flex:1;min-width:0"><b>${esc(kelasName(k.kelas_id))} · ${esc(k.mata_pelajaran)}</b><small>${esc(fmtMid(k.tanggal))} · ${esc(j.label)} (${esc(j.mulai)}–${esc(j.selesai)})${k.guru_piket_id ? ' · Cover: ' + esc(nama(k.guru_piket_id)) : ''}</small>${k.instruksi ? `<div class="small-xs mt-1" style="white-space:pre-wrap">${esc(k.instruksi)}</div>` : ''}</div>${coverChip(k)}</div>`; }).join('') : '<p class="muted">Tidak ada kelas yang ditinggalkan.</p>'}
      ${riw.length ? `<h3 class="mt-4 mb-2">Riwayat Perubahan Status</h3>${riw.map((r) => `<div class="notif-row">${ico('history')}<div><b>${esc(r.status_lama)} → ${esc(r.status_baru)}</b><small>${esc(r.diubah_oleh)} (${esc(r.peran_pengubah)}) · ${esc(fmtDT(r.waktu))}</small><div class="small-xs mt-1">${esc(r.catatan)}</div></div></div>`).join('')}` : ''}`,
    foot: `${canCancel ? `<button class="btn-la btn-danger-soft me-auto" onclick="App.batalkan('${id}')">${ico('block')} Batalkan Catatan</button>` : ''}
      ${a.jenis === 'ALFA' && S.perm.ubah_alfa && a.status !== 'DIBATALKAN' ? `<button class="btn-la btn-primary-la" onclick="App.ubahStatus('${id}')">${ico('edit')} Ubah Status</button>` : ''}
      <button class="btn-la btn-ghost" data-bs-dismiss="modal">Tutup</button>`
  });
}

function ubahStatus(id) {
  const a = S.idx.absen[id]; if (!a) return;
  const p = pegById(a.pengguna_id);
  const isAdmin = S.perm.kelola_pengguna;
  modal({
    title: 'Ubah Status Kehadiran', sub: `Resolusi Status Alfa • Staf ${p.unit_id}`, icon: 'edit_note', size: 'md',
    body: `<div class="person p-3 mb-3" style="background:var(--surface-tint);border-radius:14px">${avatar(p.id_pengguna, p.nama)}<div><div class="nm">${esc(p.nama)}</div><div class="sub">${esc(p.bidang_studi || '')} ${esc(p.unit_id)} • Status saat ini: <b style="color:var(--alfa-fg)">${a.jenis === 'ALFA' ? 'Alfa' : esc(a.jenis)}</b></div></div></div>
      <form id="usForm" novalidate>
        <label class="form-label-la" for="usStatus">Opsi Status Baru <span class="req">*</span></label>
        <select class="select-la mb-3" id="usStatus" required>
          <option value="">— Pilih status baru —</option>
          <option value="SAKIT">Sakit (sudah dikonfirmasi)</option>
          <option value="IZIN:PRIBADI">Izin Pribadi</option>
          <option value="IZIN:TUGAS_SEKOLAH">Izin Tugas Sekolah</option>
          ${isAdmin || a.jenis !== 'ALFA' ? '<option value="ALFA">Alfa (koreksi Admin)</option>' : '<option value="ALFA">Tetap Alfa (catat konfirmasi)</option>'}
        </select>
        <label class="form-label-la" for="usNote">Alasan / Catatan Perubahan <span class="req">*</span></label>
        <textarea class="textarea-la" id="usNote" required placeholder="Contoh: Konfirmasi via telepon pukul 08:30 — beliau sakit demam, surat dokter menyusul."></textarea>
        <div class="field-err">Catatan wajib diisi.</div>
        <div class="info-box mt-3">${ico('verified_user')}<div>Perubahan dicatat di riwayat beserta nama, peran (${esc(S.me.jabatan)}), dan waktu.</div></div>
      </form>`,
    foot: `<button class="btn-la btn-ghost" data-bs-dismiss="modal">Batal</button><button class="btn-la btn-primary-la" type="submit" form="usForm">${ico('check')} Simpan Perubahan</button>`,
    onShow: () => {
      $('#usForm').onsubmit = (e) => {
        e.preventDefault();
        const v = $('#usStatus').value, note = $('#usNote').value.trim();
        $('#usStatus').classList.toggle('is-invalid', !v); $('#usNote').classList.toggle('is-invalid', !note);
        if (!v || !note) return;
        const [jenis, sub] = v.split(':');
        closeModal();
        // Optimistic: ubah lokal, catat riwayat, sinkron di latar
        const before = clone(a);
        Object.assign(a, { jenis, sub_izin: sub || '', _pending: true });
        const tmpR = { riwayat_id: uid(), absen_id: id, status_lama: before.jenis + (before.sub_izin ? ':' + before.sub_izin : ''), status_baru: v, catatan: note, diubah_oleh: S.me.nama, peran_pengubah: S.me.jabatan, waktu: nowJakarta().iso };
        S.data.riwayat.push(tmpR); reindex(); refreshView();
        toast('ok', 'Status diperbarui', `${p.nama}: ${before.jenis} → ${jenis}${sub ? ' (' + sub.replace('_', ' ').toLowerCase() + ')' : ''}`);
        run('ubahStatusAlfa', id, jenis, sub || '', note).then((r) => {
          Object.assign(a, r.absen); delete a._pending;
          Object.assign(tmpR, r.riwayat); reindex(); refreshView();
        }).catch((err) => {
          Object.keys(a).forEach((k) => delete a[k]); Object.assign(a, before);
          S.data.riwayat = S.data.riwayat.filter((x) => x !== tmpR); reindex(); refreshView();
          toast('err', 'Perubahan dibatalkan', err.message);
        });
      };
    }
  });
}

async function batalkan(id) {
  const a = S.idx.absen[id]; if (!a) return;
  const ok = await confirmDlg({ title: 'Batalkan catatan?', msg: `Catatan ketidakhadiran ${nama(a.pengguna_id)} akan ditandai DIBATALKAN dan tidak dihitung di rekap.`, ok: 'Ya, batalkan', danger: true });
  if (!ok) return;
  const prev = a.status;
  a.status = 'DIBATALKAN'; reindex(); refreshView();
  toast('ok', 'Catatan dibatalkan', '', { action: 'Urungkan', onAction: () => toast('info', 'Gunakan Input ulang', 'Catatan yang dibatalkan dapat diinput kembali.') });
  run('batalkanKetidakhadiran', id, 'Dibatalkan oleh ' + S.me.nama).catch((err) => { a.status = prev; reindex(); refreshView(); toast('err', 'Gagal membatalkan', err.message); });
}

// ════════════════════════════════════════════════════════════════════════════
// 8. INPUT KETIDAKHADIRAN (TU/Kepsek/Admin) & LAPOR SAKIT (Guru)
// ════════════════════════════════════════════════════════════════════════════
function newForm() {
  const guru = !S.perm.input_absen;
  return { pengguna_id: guru ? S.me.id_pengguna : '', tanggal_mulai: S.today, tanggal_berakhir: S.today, cakupan: 'SEHARIAN', jenis: guru ? 'SAKIT' : '', sub_izin: '', alasan: '', berkas: null, kelas: [], kirimNotif: true, setuju: false, q: '' };
}
function renderInput() {
  if (!S.form) { S.form = Object.assign(newForm(), ls.get('draft_' + S.me.id_pengguna, {})); S.form.berkas = null; }
  if (!S.perm.input_absen) S.form.pengguna_id = S.me.id_pengguna;
  const F = S.form, guru = !S.perm.input_absen;
  const peg = pegById(F.pengguna_id);
  const units = canAllUnits() ? S.idx.unitList.map((u) => u.unit_id) : (S.units || []);

  const pegOptions = () => {
    const q = (F.q || '').toLowerCase();
    return units.map((u) => {
      const ps = S.pegawai.filter((p) => p.aktif && p.unit_id === u && (!q || p.nama.toLowerCase().includes(q) || String(p.bidang_studi).toLowerCase().includes(q))).sort((a, b) => a.nama.localeCompare(b.nama));
      return ps.length ? `<optgroup label="${esc(u)} — ${esc((S.idx.unit[u] || {}).nama_lengkap || '')}">${ps.map((p) => `<option value="${p.id_pengguna}" ${p.id_pengguna === F.pengguna_id ? 'selected' : ''}>${esc(p.nama)} — ${esc(p.bidang_studi || p.jabatan || '')}</option>`).join('')}</optgroup>` : '';
    }).join('');
  };
  const choice = (v, icon, l, sub, cls) => `<button type="button" class="choice ${F.jenis === v ? 'active' : ''}" onclick="App.fSet('jenis','${v}')" ${guru && v !== 'SAKIT' ? 'disabled' : ''} aria-pressed="${F.jenis === v}"><span class="stat-ico ${cls}">${ico(icon)}</span><b>${l}</b><small>${sub}</small></button>`;

  const html = `
    <div class="page-head"><div><div class="crumbs">Presensi &amp; Jadwal <span class="msi sm">chevron_right</span> <b>${guru ? 'Portal Guru Mandiri' : 'Formulir Ketidakhadiran'}</b></div>
      <h1>${guru ? 'Formulir Mandiri Pelaporan Sakit Guru' : 'Input Ketidakhadiran Pegawai'}</h1>
      <p>${guru ? 'Laporkan ketidakhadiran karena sakit agar tim TU dan Principal dapat segera mengalokasikan guru pengganti (cover lesson).' : 'Laporkan izin, sakit, atau alfa serta delegasikan guru piket pengganti (cover lesson) secara langsung.'}</p></div>
      <span class="pill"><span class="live"></span> Sistem siap pelaporan • Term ${esc(termAktif().nomor || '')} (${esc((S.idx.tahun[termAktif().tahun_id] || {}).label || '')})</span></div>
    <form id="absForm" novalidate onsubmit="App.submitAbsen(event)">
    <div class="row g-4">
      <div class="col-xl-8">
        <div class="card-la form-section">
          <div class="fs-head"><span class="${guru ? 'num' : 'stat-ico ico-primary'}">${guru ? '1' : ico('badge')}</span><div><h3>${guru ? 'Identitas Pelapor' : 'Data Pegawai &amp; Waktu'}</h3><p>${guru ? 'Data terverifikasi otomatis dari profil akun' : 'Pilih guru/staf yang berhalangan hadir pada kalender akademik'}</p></div>${guru ? `<span class="chip unit ms-auto">${ico('verified_user', 'sm')} Terkunci</span>` : ''}</div>
          ${guru ? `<div class="panel-tint"><div class="row g-3"><div class="col-sm-6"><div class="eyebrow muted mb-1" style="color:var(--muted)">Nama Lengkap</div><b class="text-strong">${esc(S.me.nama)}</b></div><div class="col-sm-6"><div class="eyebrow mb-1" style="color:var(--muted)">Email Akademik</div><b class="text-strong" style="word-break:break-all">${esc(S.me.email)}</b></div>
              <div class="col-sm-6"><div class="eyebrow mb-1" style="color:var(--muted)">Unit</div><span class="chip unit">${esc(S.me.unit_id)}</span> ${esc((S.idx.unit[S.me.unit_id] || {}).nama_lengkap || '')}</div><div class="col-sm-6"><div class="eyebrow mb-1" style="color:var(--muted)">Mata Pelajaran</div>${esc(S.me.bidang_studi || '—')}</div></div></div>`
          : `<label class="form-label-la" for="fPeg">Pilih Pegawai <span class="req">*</span></label>
             <div class="row g-2 mb-3"><div class="col-md-5"><div class="search-box">${ico('search')}<input class="input-la" id="fPegQ" placeholder="Saring nama / bidang…" value="${esc(F.q)}" oninput="App.fPegQ(this.value)" aria-label="Saring pegawai"></div></div>
             <div class="col-md-7"><select class="select-la" id="fPeg" required onchange="App.fSet('pengguna_id', this.value)"><option value="">— Pilih Guru atau Tenaga Kependidikan —</option>${pegOptions()}</select><div class="field-err">Pilih pegawai.</div></div></div>`}
          <div class="row g-3 ${guru ? 'mt-1' : ''}">
            <div class="col-sm-6"><label class="form-label-la" for="fMulai">Tanggal Mulai${guru ? ' Sakit' : ''} <span class="req">*</span></label><input type="date" class="input-la" id="fMulai" value="${F.tanggal_mulai}" required onchange="App.fSet('tanggal_mulai', this.value)"></div>
            <div class="col-sm-6"><label class="form-label-la" for="fAkhir">Tanggal ${guru ? 'Selesai (Perkiraan)' : 'Berakhir'} <span class="req">*</span></label><input type="date" class="input-la" id="fAkhir" value="${F.tanggal_berakhir}" min="${F.tanggal_mulai}" required onchange="App.fSet('tanggal_berakhir', this.value)"><div class="field-err" id="errAkhir">Tanggal berakhir tidak boleh lebih awal.</div></div>
            <div class="col-12"><div class="help" id="fDurasi"></div></div>
            <div class="col-12"><div class="seg" role="radiogroup" aria-label="Cakupan hari">${[['SEHARIAN', 'Seharian penuh'], ['SEBAGIAN', 'Sebagian hari']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${F.cakupan === v}" class="${F.cakupan === v ? 'active' : ''}" onclick="App.fSet('cakupan','${v}')">${l}</button>`).join('')}</div></div>
          </div>
        </div>

        <div class="card-la form-section">
          <div class="fs-head"><span class="${guru ? 'num' : 'stat-ico ico-primary'}">${guru ? '2' : ico('category')}</span><div><h3>${guru ? 'Detail Sakit' : 'Kategori Ketidakhadiran'}</h3><p>${guru ? 'Jelaskan kondisi Anda secara singkat' : 'Pilih jenis presensi yang akan dicatat pada ledger kehadiran'}</p></div></div>
          ${guru ? `<div class="info-box mb-3">${ico('info')}<div>Sesuai regulasi akademik, guru hanya dapat melaporkan mandiri kategori <b>Sakit</b>. Izin pribadi atau tugas dinas diajukan melalui TU / Principal.</div></div>`
          : `<div class="choice-grid mb-3" role="radiogroup" aria-label="Jenis ketidakhadiran">${choice('SAKIT', 'medical_services', 'Sakit', 'Kondisi medis / rawat', 'ico-sakit')}${choice('IZIN', 'event_available', 'Izin', 'Pribadi / penugasan resmi', 'ico-izin')}${choice('ALFA', 'event_busy', 'Alfa', 'Tanpa konfirmasi hadir', 'ico-alfa')}</div>
             <div class="field-err" id="errJenis">Pilih kategori ketidakhadiran.</div>
             ${F.jenis === 'IZIN' ? `<div class="panel-tint mb-3"><div class="d-flex justify-content-between mb-2"><b class="text-strong small-xs">${ico('tune', 'sm')} Pilih Jenis Izin:</b><span class="small-xs muted">Klasifikasi disposisi</span></div><div class="subchoice">
                <button type="button" class="choice ${F.sub_izin === 'PRIBADI' ? 'active' : ''}" onclick="App.fSet('sub_izin','PRIBADI')">${ico('schedule')}<div><b style="font-size:14px">Izin Pribadi</b><br><small>Urusan keluarga, kedukaan, dll.</small></div></button>
                <button type="button" class="choice ${F.sub_izin === 'TUGAS_SEKOLAH' ? 'active' : ''}" onclick="App.fSet('sub_izin','TUGAS_SEKOLAH')">${ico('school')}<div><b style="font-size:14px">Izin Tugas Sekolah</b><br><small>Pelatihan, pengawas ujian, dinas luar</small></div></button></div><div class="field-err" id="errSub">Pilih jenis izin.</div></div>` : ''}`}
          <label class="form-label-la" for="fAlasan">${guru ? 'Gejala / Keterangan Sakit' : 'Keterangan / Alasan Ketidakhadiran'} <span class="req">*</span></label>
          <textarea class="textarea-la" id="fAlasan" required placeholder="${guru ? 'Contoh: Demam tinggi sejak semalam, sudah periksa ke dokter dan disarankan istirahat 2 hari.' : 'Tuliskan keterangan singkat terkait permohonan atau alasan tidak bertugas…'}" oninput="App.fSet('alasan', this.value, true)">${esc(F.alasan)}</textarea><div class="field-err">Keterangan wajib diisi.</div>
        </div>

        <div class="card-la form-section">
          <div class="fs-head"><span class="${guru ? 'num' : 'stat-ico ico-primary'}">${guru ? '3' : ico('attach_file')}</span><div><h3>Berkas Pendukung (Opsional)</h3><p>${guru ? 'Surat keterangan dokter atau kwitansi rawat' : 'Unggah dokumen pembuktian jika sudah tersedia'}</p></div></div>
          <div class="info-box mb-3">${ico('info')}<div><b>Ketentuan pelaporan cepat:</b> surat izin atau surat dokter bersifat opsional. Guru piket tetap dapat langsung dialokasikan tanpa menunggu dokumen.</div></div>
          <div id="fBerkasBox"></div>
        </div>

        <div class="card-la form-section">
          <div class="fs-head"><span class="${guru ? 'num' : 'stat-ico ico-primary'}">${guru ? '4' : ico('swap_horiz')}</span><div><h3>${guru ? 'Instruksi Pembelajaran Mandiri (Cover Lesson)' : 'Kelas yang Ditinggalkan &amp; Guru Piket'}</h3><p>${guru ? 'Arahan tugas agar siswa tetap produktif di bawah pengawasan guru piket' : 'Penetapan pengganti (cover lesson) jam mengajar'}</p></div>
            <button type="button" class="btn-la btn-soft btn-sm-la ms-auto" onclick="App.fAddSlot()" ${peg.unit_id ? '' : 'disabled title="Pilih pegawai dahulu"'}>${ico('add', 'sm')} Tambah Jadwal</button>
            ${peg.unit_id && (S.data.jmengajar || []).some((j) => j.pengguna_id === peg.id_pengguna) ? `<button type="button" class="btn-la btn-primary-la btn-sm-la ms-2" onclick="App.fIsiJadwal()" title="Isi otomatis dari jadwal mengajar">${ico('auto_fix_high', 'sm')} Isi dari Jadwal Mengajar</button>` : ''}</div>
          <div id="fSlots"></div>
          ${!guru ? `<label class="check-la mt-3 panel-tint"><input type="checkbox" ${F.kirimNotif ? 'checked' : ''} onchange="App.fSet('kirimNotif', this.checked, true)" ${S.app.notifAktif ? '' : 'disabled'}><span><b class="text-strong">${ico('mail', 'sm')} Kirim email notifikasi ke Kepala Sekolah dan Guru Piket</b><br><small class="muted">${S.app.notifAktif ? 'Surat tugas pengganti otomatis dikirim via email resmi sekolah ke Kepala Sekolah unit dan guru piket bertugas.' : 'Notifikasi email sedang dimatikan oleh Admin.'}</small></span></label>` : ''}
        </div>
        <div class="d-flex gap-2 mt-4 mb-2 flex-wrap">
          <button type="button" class="btn-la btn-ghost" onclick="App.fReset()">Batal &amp; Kosongkan</button>
          <button type="submit" class="btn-la btn-primary-la" id="absSubmit">${ico(guru ? 'send' : 'save')} ${guru ? 'Kirim Laporan Sakit' : 'Simpan &amp; Tugaskan Cover Lesson'}</button>
        </div>
      </div>
      <div class="col-xl-4">
        <div style="position:sticky;top:calc(var(--topbar-h) + 16px)">
          <div class="card-la card-pad mb-3" id="fSummary"></div>
          ${guru ? `<label class="check-la card-la card-pad mb-3"><input type="checkbox" id="fSetuju" ${F.setuju ? 'checked' : ''} onchange="App.fSet('setuju', this.checked, true)"><span>Saya menyatakan pelaporan sakit ini dibuat dengan sebenarnya sesuai kondisi saya saat ini.</span></label>` : ''}
          <div class="card-la card-pad"><h3 class="mb-2">${ico('help', 'sm')} Pedoman Cover Lesson</h3>
            <div class="small-xs d-flex gap-2 mb-2">${ico('check', 'sm')}<span>Guru piket mengawasi kelas dan memastikan siswa menyelesaikan materi mandiri.</span></div>
            <div class="small-xs d-flex gap-2 mb-2">${ico('check', 'sm')}<span>Daftar guru piket berasal dari Jadwal Piket yang ditetapkan Admin untuk tanggal &amp; unit tersebut.</span></div>
            <div class="small-xs d-flex gap-2">${ico('check', 'sm')}<span>Laporan langsung terintegrasi dengan modul Rekap Guru.</span></div></div>
        </div>
      </div>
    </div></form>`;
  $('#view-input').innerHTML = html;
  renderBerkasBox(); renderSlots(); renderSummary(); renderDurasi();
}

function renderDurasi() {
  const F = S.form, el = $('#fDurasi'); if (!el) return;
  const u = pegById(F.pengguna_id).unit_id || S.me.unit_id;
  if (F.tanggal_berakhir < F.tanggal_mulai) { el.innerHTML = ''; return; }
  const n = countHK(F.tanggal_mulai, F.tanggal_berakhir, u);
  el.innerHTML = `<span style="color:var(--ok-fg);font-weight:600">${ico('check_circle', 'sm')} Total durasi: ${n} hari kerja</span> • ${esc(HARI[dow(F.tanggal_mulai)])}${F.tanggal_berakhir !== F.tanggal_mulai ? ' — ' + esc(HARI[dow(F.tanggal_berakhir)]) : ''}`;
}

function renderBerkasBox() {
  const F = S.form, box = $('#fBerkasBox'); if (!box) return;
  box.innerHTML = F.berkas
    ? `<div class="file-pill"><span class="fi">${ico(F.berkas.mime === 'application/pdf' ? 'picture_as_pdf' : 'image')}</span><div style="flex:1;min-width:0"><div class="nm">${esc(F.berkas.name)}</div><div class="small-xs muted">${bytesLabel(F.berkas.size)} • Terlampir</div></div><button type="button" class="icon-btn" onclick="App.fClearFile()" aria-label="Hapus berkas">${ico('delete')}</button></div>`
    : `<label class="dropzone" id="fDrop"><input type="file" accept="application/pdf,image/jpeg,image/png" onchange="App.fFile(this.files[0])" aria-label="Unggah berkas pendukung"><span class="dz-ico">${ico('upload_file')}</span><b class="text-strong d-block">Tarik berkas ke sini atau telusuri perangkat</b><span class="small-xs muted">PDF, JPG, PNG maks. 5 MB</span></label>`;
  const dz = $('#fDrop');
  if (dz) { dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); }; dz.ondragleave = () => dz.classList.remove('drag'); dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); fFile(e.dataTransfer.files[0]); }; }
}

function piketOptions(tgl, unit, exclude) {
  return S.data.piket.filter((p) => p.tanggal === tgl && p.unit_id === unit && p.pengguna_id !== exclude)
    .map((p) => { const load = S.data.cover.filter((k) => k.guru_piket_id === p.pengguna_id && k.tanggal === tgl).length; return { v: p.pengguna_id, l: `${nama(p.pengguna_id)} — Piket ${p.shift === 'SIANG' ? 'Siang' : 'Pagi'} ${unit}${load ? ` (${load} tugas)` : ''}` }; });
}

function renderSlots() {
  const F = S.form, box = $('#fSlots'); if (!box) return;
  const guru = !S.perm.input_absen;
  const peg = pegById(F.pengguna_id), unit = peg.unit_id;
  if (!F.kelas.length) { box.innerHTML = `<div class="empty py-4">${ico('event_seat')}<b>${unit ? 'Belum ada kelas ditambahkan' : 'Pilih pegawai terlebih dahulu'}</b>${unit ? 'Tekan “Tambah Jadwal” untuk setiap jam mengajar yang ditinggalkan.' : ''}</div>`; return; }
  const kelas = S.master.kelas.filter((k) => k.unit_id === unit && isOn(k.aktif));
  const jams = S.idx.jamByUnit[unit] || [];
  const dates = []; for (let d = F.tanggal_mulai; d <= F.tanggal_berakhir && dates.length < 62; d = addDays(d, 1)) if (hariKerja(d, unit)) dates.push(d);
  box.innerHTML = F.kelas.map((k, i) => {
    const po = piketOptions(k.tanggal, unit, F.pengguna_id);
    return `<div class="slot-box" data-i="${i}">
      <div class="d-flex justify-content-between align-items-center mb-3"><div><span class="slot-tag">Slot #${i + 1}</span> <span class="small-xs muted ms-1">Penugasan periode</span></div><button type="button" class="icon-btn" onclick="App.fDelSlot(${i})" aria-label="Hapus slot ${i + 1}">${ico('delete')}</button></div>
      <div class="row g-2">
        <div class="col-md-4"><label class="form-label-la">Kelas <span class="req">*</span></label><select class="select-la" onchange="App.fSlot(${i},'kelas_id',this.value)" required><option value="">— Kelas —</option>${kelas.map((x) => `<option value="${x.kelas_id}" ${x.kelas_id === k.kelas_id ? 'selected' : ''}>${esc(x.nama_kelas)}</option>`).join('')}</select><div class="field-err">Pilih kelas.</div></div>
        <div class="col-md-4"><label class="form-label-la">Tanggal <span class="req">*</span></label><select class="select-la" onchange="App.fSlot(${i},'tanggal',this.value)">${dates.map((d) => `<option value="${d}" ${d === k.tanggal ? 'selected' : ''}>${esc(HARI_S[dow(d)] + ', ' + fmtShort(d))}</option>`).join('')}</select></div>
        <div class="col-md-4"><label class="form-label-la">Mata Pelajaran</label><input class="input-la" value="${esc(k.mata_pelajaran)}" oninput="App.fSlot(${i},'mata_pelajaran',this.value,true)" placeholder="${esc(peg.bidang_studi || 'Mata pelajaran')}"></div>
        <div class="col-6 col-md-4"><label class="form-label-la">Jam Ke- (mulai) <span class="req">*</span></label><select class="select-la" onchange="App.fSlot(${i},'jam_awal_id',this.value)" required><option value="">—</option>${jams.map((j) => `<option value="${j.jam_id}" ${j.jam_id === k.jam_awal_id ? 'selected' : ''}>Jam ${j.urutan} (${j.mulai})</option>`).join('')}</select><div class="field-err">Pilih jam.</div></div>
        <div class="col-6 col-md-4"><label class="form-label-la">s/d Jam Ke-</label><select class="select-la" onchange="App.fSlot(${i},'jam_akhir_id',this.value)" ${k.jam_awal_id ? '' : 'disabled'}>${k.jam_awal_id ? '' : '<option value="">—</option>'}${jams.filter((j) => !k.jam_awal_id || Number(j.urutan) >= Number((S.idx.jam[k.jam_awal_id] || {}).urutan)).map((j) => `<option value="${j.jam_id}" ${j.jam_id === (k.jam_akhir_id || k.jam_awal_id) ? 'selected' : ''}>Jam ${j.urutan} (s/d ${j.selesai})</option>`).join('')}</select></div>
        ${guru ? '' : `<div class="col-md-4"><label class="form-label-la">Guru Piket Pengganti</label><select class="select-la" onchange="App.fSlot(${i},'guru_piket_id',this.value)" ${S.perm.kelola_cover ? '' : 'disabled'}><option value="">${po.length ? '— Pilih guru piket —' : 'Tidak ada guru piket terjadwal'}</option>${po.map((o) => `<option value="${o.v}" ${o.v === k.guru_piket_id ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select><div class="help">${ico('verified_user', 'sm')} Daftar guru piket ditetapkan Admin</div></div>`}
        <div class="col-12"><label class="form-label-la">Instruksi Tugas Pengganti (tugas mandiri untuk siswa)</label><textarea class="textarea-la" style="min-height:72px" oninput="App.fSlot(${i},'instruksi',this.value,true)" placeholder="Contoh: Kerjakan Latihan Mandiri Bab 4 halaman 112 nomor 1–10, kumpulkan di meja guru.">${esc(k.instruksi)}</textarea></div>
      </div></div>`;
  }).join('');
}

function renderSummary() {
  const F = S.form, el = $('#fSummary'); if (!el) return;
  const p = pegById(F.pengguna_id);
  const jenisLbl = F.jenis === 'IZIN' ? (F.sub_izin === 'TUGAS_SEKOLAH' ? 'Izin Tugas Sekolah' : F.sub_izin === 'PRIBADI' ? 'Izin Pribadi' : 'Izin') : F.jenis === 'SAKIT' ? 'Sakit' : F.jenis === 'ALFA' ? 'Alfa' : '—';
  const cls = F.jenis === 'SAKIT' ? 'sakit' : F.jenis === 'ALFA' ? 'alfa' : F.jenis === 'IZIN' ? 'izin' : 'neutral';
  const terisi = F.kelas.filter((k) => k.guru_piket_id).length;
  el.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-3"><h3>${ico('fact_check', 'sm')} Ringkasan Entri</h3><span class="chip unit">Pratinjau Langsung</span></div>
    <div class="panel-tint mb-3"><div class="eyebrow mb-2" style="color:var(--muted)">Pegawai Terpilih</div>${p.id_pengguna ? `<div class="person">${avatar(p.id_pengguna, p.nama)}<div><div class="nm">${esc(p.nama)}</div><div class="sub"><span class="chip unit">Unit ${esc(p.unit_id)}</span> ${esc(p.bidang_studi || '')}</div></div></div>` : '<span class="muted">Belum dipilih</span>'}</div>
    <div class="summary-row"><span>Jenis Ketidakhadiran</span><span><span class="chip ${cls}">${esc(jenisLbl)}</span></span></div>
    <div class="summary-row"><span>Tanggal Efektif</span><span>${esc(fmtMid(F.tanggal_mulai))}${F.tanggal_berakhir !== F.tanggal_mulai ? ' – ' + esc(fmtMid(F.tanggal_berakhir)) : ''}</span></div>
    <div class="summary-row"><span>Dokumen Bukti</span><span>${F.berkas ? `<span style="color:var(--ok-fg)">${ico('check_circle', 'sm')} 1 dokumen</span>` : '<i class="muted" style="font-weight:400">Belum diunggah (opsional)</i>'}</span></div>
    <div class="summary-row"><span>Alokasi Cover Lesson</span><span>${F.kelas.length} sesi${F.kelas.length ? ` · ${terisi} terisi` : ''}</span></div>
    ${F.kelas.filter((k) => k.kelas_id).map((k) => { const j = jamInfo(k); return `<div class="panel-tint mt-2 py-2"><div class="d-flex justify-content-between"><b class="text-strong small-xs">${esc(kelasName(k.kelas_id))}</b><span class="small-xs muted">${esc(fmtShort(k.tanggal))} · ${esc(j.label)}</span></div><div class="small-xs" style="color:${k.guru_piket_id ? 'var(--cover-fg)' : 'var(--izin-fg)'}">${ico(k.guru_piket_id ? 'person_check' : 'person_alert', 'sm')} ${esc(k.guru_piket_id ? nama(k.guru_piket_id) : 'Belum ditugaskan')}</div></div>`; }).join('')}
    <div class="info-box mt-3">${ico('mail')}<div><b>Distribusi notifikasi:</b> ${S.app.notifAktif && F.kirimNotif !== false ? 'email otomatis ke Kepala Sekolah unit dan guru piket terkait setelah disimpan.' : 'notifikasi email tidak dikirim.'}</div></div>`;
}

const saveDraft = debounce(() => { const d = Object.assign({}, S.form); delete d.berkas; ls.set('draft_' + S.me.id_pengguna, d); }, 400);

function fSet(k, v, silent) {
  const F = S.form; F[k] = v;
  if (k === 'pengguna_id') { F.kelas = []; }
  if (k === 'tanggal_mulai') { if (F.tanggal_berakhir < v) F.tanggal_berakhir = v; F.kelas.forEach((s) => { if (s.tanggal < v) s.tanggal = v; }); }
  if (k === 'tanggal_berakhir') F.kelas.forEach((s) => { if (s.tanggal > v) s.tanggal = F.tanggal_mulai; });
  if (k === 'jenis' && v !== 'IZIN') F.sub_izin = '';
  saveDraft();
  if (silent) { renderSummary(); return; }
  if (['jenis', 'sub_izin', 'cakupan', 'pengguna_id'].includes(k)) { const y = window.scrollY; renderInput(); window.scrollTo(0, y); return; }
  if (k === 'tanggal_mulai' || k === 'tanggal_berakhir') { $('#fAkhir').min = F.tanggal_mulai; $('#fAkhir').value = F.tanggal_berakhir; renderDurasi(); renderSlots(); }
  renderSummary();
}
const fPegQ = debounce((q) => { S.form.q = q; const sel = $('#fPeg'); if (!sel) return; const cur = S.form.pengguna_id; const y = window.scrollY; renderInput(); window.scrollTo(0, y); const inp = $('#fPegQ'); if (inp) { inp.focus(); inp.setSelectionRange(q.length, q.length); } if (cur) $('#fPeg').value = cur; }, 250);
function fAddSlot() {
  const F = S.form, p = pegById(F.pengguna_id);
  if (!p.unit_id) { toast('warn', 'Pilih pegawai dahulu'); return; }
  let tgl = F.tanggal_mulai; while (!hariKerja(tgl, p.unit_id) && tgl < F.tanggal_berakhir) tgl = addDays(tgl, 1);
  F.kelas.push({ tanggal: tgl, kelas_id: '', jam_awal_id: '', jam_akhir_id: '', mata_pelajaran: p.bidang_studi || '', instruksi: '', guru_piket_id: '' });
  renderSlots(); renderSummary(); saveDraft();
  const last = $$('#fSlots .slot-box').pop(); if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function fDelSlot(i) { S.form.kelas.splice(i, 1); renderSlots(); renderSummary(); saveDraft(); }
function fSlot(i, k, v, silent) {
  const s = S.form.kelas[i]; s[k] = v;
  if (k === 'jam_awal_id') { const a = Number((S.idx.jam[v] || {}).urutan), b = Number((S.idx.jam[s.jam_akhir_id] || {}).urutan); if (!s.jam_akhir_id || b < a) s.jam_akhir_id = v; }
  if (k === 'tanggal') { if (s.guru_piket_id && !piketOptions(v, pegById(S.form.pengguna_id).unit_id, S.form.pengguna_id).some((o) => o.v === s.guru_piket_id)) s.guru_piket_id = ''; }
  saveDraft();
  if (!silent && ['jam_awal_id', 'tanggal'].includes(k)) renderSlots();
  renderSummary();
}
function fFile(file) {
  const err = checkFile(file, 5, ['application/pdf', 'image/jpeg', 'image/png']);
  if (err) { toast('warn', 'Berkas tidak valid', err); return; }
  readFile(file).then((f) => { S.form.berkas = f; renderBerkasBox(); renderSummary(); }).catch((e) => toast('err', 'Gagal membaca berkas', e.message));
}
function fClearFile() { S.form.berkas = null; renderBerkasBox(); renderSummary(); }
function fReset() { S.form = newForm(); ls.del('draft_' + S.me.id_pengguna); renderInput(); toast('info', 'Formulir dikosongkan'); }

function validateAbsen() {
  const F = S.form, guru = !S.perm.input_absen;
  const errs = [];
  const mark = (sel, bad) => { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.classList.toggle('is-invalid', !!bad); if (bad) errs.push(el); };
  if (!guru) mark('#fPeg', !F.pengguna_id);
  mark('#fMulai', !F.tanggal_mulai);
  mark('#fAkhir', !F.tanggal_berakhir || F.tanggal_berakhir < F.tanggal_mulai);
  if (!guru) { const e = $('#errJenis'); if (e) e.classList.toggle('show', !F.jenis); if (!F.jenis) errs.push($('.choice-grid')); }
  if (F.jenis === 'IZIN') { const e = $('#errSub'); if (e) e.classList.toggle('show', !F.sub_izin); if (!F.sub_izin) errs.push(e); }
  mark('#fAlasan', !F.alasan.trim());
  $$('#fSlots .slot-box').forEach((box, i) => {
    const s = F.kelas[i]; const sels = $$('select', box);
    mark(sels[0], !s.kelas_id); mark(sels[2], !s.jam_awal_id);
  });
  if (guru && !F.setuju) { errs.push($('#fSetuju')); toast('warn', 'Pernyataan belum dicentang', 'Centang pernyataan kebenaran laporan.'); }
  // Cek tumpang tindih secara lokal (server tetap memvalidasi ulang)
  if (F.pengguna_id && F.tanggal_mulai) {
    const o = S.data.absen.find((a) => a.pengguna_id === F.pengguna_id && a.status !== 'DIBATALKAN' && a.tanggal_mulai <= F.tanggal_berakhir && a.tanggal_berakhir >= F.tanggal_mulai);
    if (o) { toast('err', 'Tanggal bertabrakan', `${nama(F.pengguna_id)} sudah tercatat ${o.jenis.toLowerCase()} pada ${fmtMid(o.tanggal_mulai)}.`); errs.push($('#fMulai')); }
  }
  if (errs.length && errs[0]) { errs[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); if (errs[0].focus) errs[0].focus({ preventScroll: true }); }
  return !errs.length;
}

function submitAbsen(e) {
  e.preventDefault();
  if (!validateAbsen()) return;
  const F = S.form, guru = !S.perm.input_absen, p = pegById(F.pengguna_id);
  const payload = {
    pengguna_id: F.pengguna_id, tanggal_mulai: F.tanggal_mulai, tanggal_berakhir: F.tanggal_berakhir, jenis: F.jenis, sub_izin: F.sub_izin,
    cakupan: F.cakupan, alasan: F.alasan.trim(), kirimNotif: F.kirimNotif !== false, berkas: F.berkas ? { name: F.berkas.name, mime: F.berkas.mime, data: F.berkas.data } : null,
    kelas: F.kelas.map((k) => ({ tanggal: k.tanggal, kelas_id: k.kelas_id, jam_awal_id: k.jam_awal_id, jam_akhir_id: k.jam_akhir_id || k.jam_awal_id, mata_pelajaran: k.mata_pelajaran || p.bidang_studi || '', instruksi: k.instruksi, guru_piket_id: guru ? '' : k.guru_piket_id }))
  };
  // Optimistic: tampil langsung di Kehadiran/Cover, server menyusul
  const tmpId = uid(), now = nowJakarta().iso;
  const absen = { absen_id: tmpId, pengguna_id: p.id_pengguna, unit_id: p.unit_id, tanggal_mulai: payload.tanggal_mulai, tanggal_berakhir: payload.tanggal_berakhir, jenis: payload.jenis, sub_izin: payload.sub_izin, cakupan: payload.cakupan, alasan: payload.alasan, berkas_id: '', status: 'AKTIF', dicatat_oleh: S.me.id_pengguna, dicatat_pada: now, _pending: true };
  const covers = payload.kelas.map((k) => Object.assign({ cover_id: uid(), absen_id: tmpId, unit_id: p.unit_id, guru_utama_id: p.id_pengguna, status: k.guru_piket_id ? 'DITUGASKAN' : 'BELUM_DITUGASKAN', catatan_selesai: '', _pending: true }, k));
  S.data.absen.push(absen); S.data.cover.push(...covers); reindex();
  const formBackup = S.form;
  S.form = null; ls.del('draft_' + S.me.id_pengguna);
  S.tanggal = payload.tanggal_mulai <= S.today && payload.tanggal_berakhir >= S.today ? S.today : payload.tanggal_mulai;
  go(guru ? 'beranda' : (covers.length ? 'cover' : 'kehadiran'));
  toast('ok', guru ? 'Laporan sakit terkirim' : 'Ketidakhadiran tersimpan', `${p.nama} · ${covers.length} slot kelas${payload.berkas ? ' · mengunggah berkas…' : ''}`);
  run('saveKetidakhadiran', payload).then((r) => {
    Object.assign(absen, r.absen); delete absen._pending;
    S.data.cover = S.data.cover.filter((k) => !covers.includes(k)).concat(r.covers);
    reindex(); refreshView();
  }).catch((err) => {
    S.data.absen = S.data.absen.filter((a) => a !== absen);
    S.data.cover = S.data.cover.filter((k) => !covers.includes(k));
    reindex(); S.form = formBackup; ls.set('draft_' + S.me.id_pengguna, Object.assign({}, formBackup, { berkas: null }));
    go('input');
    toast('err', 'Gagal menyimpan — data dikembalikan ke formulir', err.message, { ms: 9000 });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 9. COVER LESSON
// ════════════════════════════════════════════════════════════════════════════
function renderCover() {
  const units = activeUnits();
  const all = coversOn(S.tanggal, units);
  const st = S.ui.cov.st;
  const list = all.filter((k) => !st || k.status === st);
  const n = (s) => all.filter((k) => k.status === s).length;
  const canEdit = S.perm.kelola_cover;
  const piket = S.data.piket.filter((p) => p.tanggal === S.tanggal && units.includes(p.unit_id)).sort((a, b) => a.unit_id.localeCompare(b.unit_id) || a.shift.localeCompare(b.shift));
  const ta = S.idx.tahun[termAktif().tahun_id] || {};
  const box = (lbl, v, icon, cls) => `<div class="col-4"><div class="card-la stat-card flex-row align-items-center" style="gap:14px"><span class="stat-ico ${cls}" style="width:52px;height:52px">${ico(icon, 'lg')}</span><div><div class="small-xs muted fw-semibold">${lbl}</div><div class="stat-value" style="font-size:28px">${v}</div></div></div></div>`;

  $('#view-cover').innerHTML = `
    <div class="page-head" style="align-items:center"><div style="flex:1;min-width:280px"><div class="crumbs"><b>Modul Manajemen Pengganti</b> • T.A. ${esc(ta.label || '')} · Term ${esc(termAktif().nomor || '')}</div>
      <h1>Cover Lesson &amp; Penugasan Harian</h1><p>Kelola guru pengganti, pantau ketersediaan guru piket tiap unit, dan kirim instruksi materi siswa.</p></div>
      <div class="row g-2" style="flex:1;min-width:300px;max-width:640px">${box('Belum Ditugaskan', n('BELUM_DITUGASKAN'), 'pending_actions', 'ico-primary')}${box('Ditugaskan', n('DITUGASKAN'), 'assignment_ind', 'ico-cover')}${box('Selesai', n('SELESAI'), 'task_alt', 'ico-hadir')}</div></div>
    <div class="card-la card-pad py-3 mb-4 d-flex flex-wrap gap-2 align-items-center no-print">
      ${!canAllUnits() ? `<span class="btn-la btn-primary-la" style="pointer-events:none">${ico('lock')} Unit ${esc((S.idx.unit[S.unit] || {}).nama_lengkap || S.unit)} (${esc(S.unit)})</span><span class="muted small-xs">Akses terkunci: ${esc(S.me.jabatan)}</span>` : `<span class="chip unit">${esc(S.unit === 'ALL' ? 'Semua Unit' : S.unit)}</span>`}
      ${!canEdit ? `<span class="chip neutral">${ico('visibility', 'sm')} Mode pantau (hanya baca)</span>` : ''}
      <div class="ms-auto d-flex gap-2"><select class="select-la" style="width:auto" onchange="App.covFilter(this.value)" aria-label="Filter status cover"><option value="">Semua Status Cover</option>${[['BELUM_DITUGASKAN', 'Belum Ditugaskan'], ['DITUGASKAN', 'Ditugaskan'], ['SELESAI', 'Selesai']].map(([v, l]) => `<option value="${v}" ${st === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="icon-btn" onclick="App.syncNow(true)" aria-label="Muat ulang data">${ico('sync')}</button></div>
    </div>
    <div class="row g-4">
      <div class="col-xl-8">
        <div class="d-flex align-items-center gap-2 mb-3 flex-wrap"><h2>Daftar Slot Jam Mengajar Memerlukan Cover</h2><span class="chip unit">${list.length} kelas</span></div>
        ${list.length ? list.map((k) => slotCard(k, canEdit)).join('<div class="mb-3"></div>') : `<div class="card-la">${emptyState('event_available', 'Tidak ada slot cover', 'Tidak ada kelas ditinggalkan pada tanggal ini.')}</div>`}
      </div>
      <div class="col-xl-4">
        <div class="card-la card-pad mb-3">
          <div class="d-flex justify-content-between align-items-start gap-2 mb-2"><div class="d-flex gap-2">${ico('admin_panel_settings', 'lg')}<div><h3 style="font-size:18px">Jadwal Guru Piket Hari Ini</h3><div class="small-xs muted">${esc(fmtLong(S.tanggal))}</div></div></div><span class="chip neutral">Read-Only</span></div>
          <p class="small-xs muted">Daftar guru piket siaga untuk penugasan cover lesson pada tanggal ini.</p>
          <div class="panel-tint">
            <div class="d-flex justify-content-between mb-2"><span class="eyebrow">Guru Piket ${esc(S.unit === 'ALL' ? 'Semua Unit' : S.unit)}</span><span class="chip selesai">${piket.length} Tersedia</span></div>
            ${piket.length ? piket.map((p) => { const load = S.data.cover.filter((k) => k.guru_piket_id === p.pengguna_id && k.tanggal === S.tanggal).length; return `<div class="piket-item"><div style="min-width:0"><b class="text-truncate">${esc(nama(p.pengguna_id))}</b><small>${p.shift === 'SIANG' ? 'Shift Siang' : 'Shift Pagi'} · ${esc(pegById(p.pengguna_id).bidang_studi || '')}${S.unit === 'ALL' ? ' · ' + esc(p.unit_id) : ''}</small></div><span class="chip ${load ? 'cover' : 'unit'}">${load ? load + ' tugas' : 'Siaga'}</span></div>`; }).join('') : `<div class="small-xs muted py-2">Belum ada guru piket terjadwal.</div>`}
          </div>
          <div class="info-box mt-3">${ico('info')}<div>Jadwal piket ditetapkan oleh Admin di Pengguna &amp; Peran › Jadwal Piket. Hubungi Admin untuk perubahan.</div></div>
        </div>
        <div class="info-box">${ico('forward_to_inbox')}<div><b class="text-strong">Pengiriman Notifikasi Email</b><br>${S.app.notifAktif ? 'Notifikasi resmi dikirim ke Kepala Sekolah unit dan guru piket bertugas.' : 'Notifikasi email sedang dimatikan.'}</div></div>
      </div>
    </div>`;
}

function slotCard(k, canEdit) {
  const j = jamInfo(k), a = S.idx.absen[k.absen_id];
  let act = '';
  if (k.status === 'SELESAI') act = `${coverChip(k)}<button class="btn-la btn-soft btn-sm-la" onclick="App.coverInfo('${k.cover_id}')">Lihat Laporan</button>`;
  else if (!canEdit) act = coverChip(k);
  else if (k.status === 'DITUGASKAN') act = `${coverChip(k)}<button class="btn-la btn-ghost btn-sm-la" onclick="App.tugaskan('${k.cover_id}')" ${k._pending ? 'disabled' : ''}>${ico('edit', 'sm')} Ubah Cover</button>`;
  else act = `${coverChip(k)}<button class="btn-la btn-primary-la" onclick="App.tugaskan('${k.cover_id}')" ${k._pending ? 'disabled' : ''}>${ico('person_add')} Tugaskan</button>`;
  return `<div class="card-la slot-card hoverable">
    <div class="time-block"><span class="jk">${esc(j.label)}</span><span class="t1">${esc(j.mulai)}</span><span class="t2">${esc(j.selesai)}</span></div>
    <div class="slot-body"><span class="chip unit">${esc(k.unit_id)}</span>
      <h3>${esc(k.mata_pelajaran || 'Mata pelajaran')}${pending(k)}</h3>
      <div class="slot-meta"><span>${ico('meeting_room', 'sm')} Kelas <b>${esc(kelasName(k.kelas_id))}</b></span>
        <span>Guru Utama: <b>${esc(nama(k.guru_utama_id))}</b>${a ? ` · <span style="color:var(--sick-fg)">${esc(a.jenis === 'IZIN' ? (a.sub_izin === 'TUGAS_SEKOLAH' ? 'Izin Tugas Sekolah' : 'Izin Pribadi') : a.jenis === 'SAKIT' ? 'Sakit' + (a.berkas_id ? ' (Surat Dokter)' : '') : 'Alfa')}</span>` : ''}</span>
        ${k.guru_piket_id ? `<span style="color:var(--cover-fg)">Pengganti: <b style="color:var(--cover-fg)">${esc(nama(k.guru_piket_id))}</b>${k.status === 'SELESAI' ? ' · <span style="color:var(--ok-fg)">Materi selesai dilaporkan</span>' : ''}</span>` : ''}
        ${k.instruksi ? `<span class="text-truncate" style="max-width:520px">${ico('assignment', 'sm')} ${esc(k.instruksi)}</span>` : ''}</div></div>
    <div class="slot-actions"><div class="slot-actions-row">${act}</div></div></div>`;
}

function tugaskan(coverId) {
  const k = S.data.cover.find((x) => x.cover_id === coverId); if (!k) return;
  const opts = piketOptions(k.tanggal, k.unit_id, k.guru_utama_id);
  const j = jamInfo(k);
  if (!opts.length) { toast('warn', 'Tidak ada guru piket', `Belum ada guru piket ${k.unit_id} pada ${fmtMid(k.tanggal)}. Minta Admin menambahkan di Jadwal Piket.`); return; }
  formModal({
    title: k.guru_piket_id ? 'Ubah Guru Pengganti' : 'Tugaskan Guru Pengganti', sub: `${kelasName(k.kelas_id)} · ${j.label} (${j.mulai}–${j.selesai}) · ${fmtMid(k.tanggal)}`, icon: 'person_add', iconCls: 'ico-cover', size: 'md', ok: 'Tugaskan', okIcon: 'swap_horiz',
    fields: [
      { k: 'guru', l: 'Guru Piket (dari Jadwal Piket)', type: 'select', req: true, opts, help: 'Hanya guru piket yang dijadwalkan Admin pada tanggal & unit ini.' },
      { k: 'instruksi', l: 'Instruksi untuk guru piket & siswa', type: 'textarea', ph: 'Tugas mandiri untuk siswa…' }
    ],
    values: { guru: k.guru_piket_id, instruksi: k.instruksi },
    extra: k.guru_piket_id && k.status !== 'SELESAI' ? `<button type="button" class="btn-link-la mt-2" style="color:var(--sick-fg)" onclick="App.lepas('${coverId}')">${ico('person_remove', 'sm')} Lepas penugasan</button>` : '',
    onSubmit: (v) => {
      const before = clone(k);
      Object.assign(k, { guru_piket_id: v.guru, instruksi: v.instruksi, status: 'DITUGASKAN', _pending: true });
      reindex(); refreshView();
      toast('ok', 'Guru pengganti ditugaskan', `${nama(v.guru)} → ${kelasName(k.kelas_id)}${S.app.notifAktif ? ' · email dikirim' : ''}`);
      run('tugaskanPiket', coverId, v.guru, v.instruksi).then((r) => { Object.assign(k, r.cover); delete k._pending; reindex(); refreshView(); })
        .catch((err) => { Object.keys(k).forEach((x) => delete k[x]); Object.assign(k, before); reindex(); refreshView(); toast('err', 'Penugasan dibatalkan', err.message); });
    }
  });
}
function lepas(coverId) {
  closeModal();
  const k = S.data.cover.find((x) => x.cover_id === coverId); if (!k) return;
  const before = clone(k);
  Object.assign(k, { guru_piket_id: '', status: 'BELUM_DITUGASKAN', _pending: true }); reindex(); refreshView();
  run('lepasPiket', coverId).then((r) => { Object.assign(k, r.cover); delete k._pending; reindex(); refreshView(); toast('ok', 'Penugasan dilepas'); })
    .catch((err) => { Object.keys(k).forEach((x) => delete k[x]); Object.assign(k, before); reindex(); refreshView(); toast('err', 'Gagal', err.message); });
}
function coverInfo(coverId) {
  const k = S.data.cover.find((x) => x.cover_id === coverId); if (!k) return;
  const j = jamInfo(k);
  modal({
    title: `Laporan Cover · ${kelasName(k.kelas_id)}`, sub: `${fmtMid(k.tanggal)} · ${j.label}`, icon: 'task_alt', iconCls: 'ico-hadir', size: 'md',
    body: `<div class="kv"><span>Guru utama</span><span>${esc(nama(k.guru_utama_id))}</span></div><div class="kv"><span>Dicover oleh</span><span>${esc(nama(k.guru_piket_id))}</span></div><div class="kv"><span>Mata pelajaran</span><span>${esc(k.mata_pelajaran)}</span></div><div class="kv"><span>Selesai</span><span>${esc(fmtDT(k.selesai_pada))}</span></div>
      <h3 class="mt-3 mb-2">Instruksi</h3><div class="quote-box" style="background:var(--surface-tint)">${esc(k.instruksi || '—')}</div><h3 class="mt-3 mb-2">Catatan Guru Piket</h3><div class="quote-box" style="background:var(--surface-tint)">${esc(k.catatan_selesai || '—')}</div>`,
    foot: '<button class="btn-la btn-ghost" data-bs-dismiss="modal">Tutup</button>'
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 10. TUGAS PIKET SAYA
// ════════════════════════════════════════════════════════════════════════════
function renderTugas() {
  const t = S.ui.tug.tgl || S.today;
  const me = S.me.id_pengguna;
  const tasks = S.data.cover.filter((k) => k.guru_piket_id === me && k.tanggal === t).sort((a, b) => Number((S.idx.jam[a.jam_awal_id] || {}).urutan) - Number((S.idx.jam[b.jam_awal_id] || {}).urutan));
  const piket = S.data.piket.filter((p) => p.pengguna_id === me && p.tanggal === t);
  const done = tasks.filter((k) => k.status === 'SELESAI').length;
  const open = tasks.filter((k) => k.status !== 'SELESAI');
  const upcoming = [...new Set(S.data.piket.filter((p) => p.pengguna_id === me && p.tanggal >= S.today).map((p) => p.tanggal).concat(S.data.cover.filter((k) => k.guru_piket_id === me && k.tanggal >= S.today).map((k) => k.tanggal)))].sort().slice(0, 7);

  $('#view-tugas').innerHTML = `
    <div class="card-la card-pad mb-4">
      <div class="d-flex flex-wrap gap-3 justify-content-between">
        <div style="flex:1;min-width:260px">
          <div class="d-flex flex-wrap gap-2 mb-2">${piket.length ? piket.map((p) => `<span class="chip selesai">${ico('radio_button_checked', 'sm')} Jadwal Piket Aktif: Shift ${p.shift === 'SIANG' ? 'Siang' : 'Pagi'}</span>`).join('') : '<span class="chip neutral">Tidak terjadwal piket</span>'}<span class="chip unit">Unit ${esc(S.me.unit_id)}</span><span class="small-xs muted align-self-center">${esc(fmtLong(t))}</span></div>
          <h1>Tugas Piket Saya</h1>
          <p class="muted mt-2 mb-0">Daftar penugasan guru pengganti (cover lesson) yang dialokasikan kepada Anda — ${esc(fmtLong(t))}.</p>
        </div>
        <div class="panel-tint d-flex gap-4 align-items-center"><div><div class="eyebrow" style="color:var(--muted)">Total Slot</div><div class="stat-value" style="font-size:26px;color:var(--primary-strong)">${tasks.length}<small>sesi</small></div></div>
          <div><div class="eyebrow" style="color:var(--muted)">Tuntas</div><div class="stat-value" style="font-size:26px;color:var(--ok-fg)">${done}</div></div>
          <div><div class="eyebrow" style="color:var(--muted)">Menunggu</div><div class="stat-value" style="font-size:26px;color:var(--cover-fg)">${open.length}</div></div></div>
      </div>
      <div class="d-flex flex-wrap gap-2 mt-3">${upcoming.map((d) => `<button class="btn-la btn-sm-la ${d === t ? 'btn-primary-la' : 'btn-soft'}" onclick="App.tugDate('${d}')">${esc(HARI_S[dow(d)] + ', ' + fmtShort(d))}</button>`).join('')}</div>
      <div class="info-box mt-3">${ico('info')}<div>Jadwal piket ditetapkan oleh Admin. Anda menerima notifikasi email setiap kali ditugaskan mengawal kelas.</div></div>
    </div>
    <div class="row g-4">
      <div class="col-xl-8">
        <div class="d-flex align-items-center gap-2 mb-3"><h2>Penugasan Kelas</h2><span class="chip unit">${tasks.length} jadwal</span></div>
        ${tasks.length ? tasks.map((k) => { const j = jamInfo(k); const isDone = k.status === 'SELESAI'; return `<div class="card-la task-card mb-3 ${isDone ? 'done' : ''}"><div class="stripe"></div><div class="card-pad">
            <div class="d-flex flex-wrap justify-content-between gap-2 align-items-start"><div class="d-flex flex-wrap gap-2 align-items-center"><span class="kelas-badge">${esc(kelasName(k.kelas_id))}</span><span class="text-strong">${ico('schedule', 'sm')} ${esc(j.label)} (${esc(j.mulai)} - ${esc(j.selesai)} WIB)</span></div>${isDone ? coverChip(k) : `<span class="chip cover">${ico('radio_button_checked', 'sm')} Ditugaskan</span>`}</div>
            <div class="panel-tint mt-3"><div class="row g-3"><div class="col-sm-6"><div class="eyebrow mb-1" style="color:var(--muted)">Mata Pelajaran</div><b class="text-strong" style="font-size:16px">${esc(k.mata_pelajaran)}</b></div><div class="col-sm-6"><div class="eyebrow mb-1" style="color:var(--muted)">Guru Utama yang Digantikan</div><b class="text-strong" style="font-size:16px">${esc(nama(k.guru_utama_id))}</b></div></div></div>
            <div class="panel-tint mt-3"><div class="small-xs fw-semibold mb-2" style="color:var(--cover-fg)">${ico('assignment', 'sm')} Instruksi Materi dari Guru Utama</div><div class="quote-box">${esc(k.instruksi || 'Tidak ada instruksi khusus. Dampingi siswa belajar mandiri.')}</div></div>
            ${isDone ? `<div class="mt-3 small-xs"><b class="text-strong">Catatan akhir sesi:</b> ${esc(k.catatan_selesai)}</div>` : `<div class="d-flex flex-wrap gap-2 mt-3"><button class="btn-la btn-primary-la" onclick="App.selesai('${k.cover_id}')" ${k._pending ? 'disabled' : ''}>${ico('task_alt')} Tandai Selesai &amp; Laporkan</button></div>`}
          </div></div>`; }).join('') : `<div class="card-la">${emptyState('free_cancellation', 'Tidak ada penugasan kelas', piket.length ? 'Anda siaga piket — penugasan akan muncul di sini.' : 'Anda tidak terjadwal piket pada tanggal ini.')}</div>`}
      </div>
      <div class="col-xl-4">
        <div class="card-la card-pad mb-3"><h3 class="mb-1">${ico('edit_note')} Laporan Selesai Mengajar</h3><p class="small-xs muted">Formulir pelaporan kelas piket.</p>
          ${open.length ? `<form id="lapForm" novalidate onsubmit="App.lapor(event)"><label class="form-label-la" for="lapSesi">Pilih Sesi Kelas Piket <span class="req">*</span></label><select class="select-la mb-3" id="lapSesi" required>${open.map((k) => `<option value="${k.cover_id}">${esc(kelasName(k.kelas_id))} — ${esc(k.mata_pelajaran)} (${esc(jamInfo(k).mulai)})</option>`).join('')}</select>
            <label class="form-label-la">Status Kondisi Siswa</label><div class="seg w-100 mb-3" role="radiogroup"><button type="button" class="active" data-v="Semua hadir" onclick="App.segPick(this)">Semua Hadir</button><button type="button" data-v="Ada yang izin/sakit" onclick="App.segPick(this)">Ada yang Izin/Sakit</button></div>
            <label class="form-label-la" for="lapNote">Catatan Singkat Jalannya Kelas <span class="req">*</span></label><textarea class="textarea-la mb-3" id="lapNote" required placeholder="Tuliskan materi yang diselesaikan, kedisiplinan kelas, dan penyerahan tugas siswa…"></textarea><div class="field-err">Catatan wajib diisi.</div>
            <button class="btn-la btn-primary-la w-100" type="submit">${ico('send')} Kirim Laporan Selesai</button></form>` : emptyState('done_all', 'Semua laporan tuntas', '')}
        </div>
        <div class="card-la card-pad"><h3 class="mb-2">${ico('gavel', 'sm')} Panduan Piket Pengganti</h3>
          ${['Wajib hadir di kelas maksimal 5 menit setelah bel pergantian jam.', 'Pastikan absensi kelas diisi sebelum pembelajaran dimulai.', 'Bila materi habis lebih awal, dampingi literasi mandiri di dalam kelas.'].map((x) => `<div class="small-xs d-flex gap-2 mb-2">${ico('check', 'sm')}<span>${x}</span></div>`).join('')}</div>
      </div>
    </div>`;
}
function segPick(btn) { $$('button', btn.parentNode).forEach((b) => b.classList.toggle('active', b === btn)); }
function lapor(e) {
  e.preventDefault();
  const id = $('#lapSesi').value, note = $('#lapNote').value.trim();
  const kond = ($('#lapForm .seg button.active') || {}).dataset;
  $('#lapNote').classList.toggle('is-invalid', !note);
  if (!note) return;
  doSelesai(id, `[${kond ? kond.v : 'Semua hadir'}] ${note}`);
}
function selesai(coverId) {
  formModal({
    title: 'Laporkan Kelas Selesai', icon: 'task_alt', iconCls: 'ico-hadir', size: 'md', ok: 'Kirim Laporan', okIcon: 'send',
    fields: [{ k: 'kond', l: 'Status kondisi siswa', type: 'select', ph: false, opts: [{ v: 'Semua hadir', l: 'Semua hadir' }, { v: 'Ada yang izin/sakit', l: 'Ada yang izin/sakit' }] }, { k: 'note', l: 'Catatan singkat jalannya kelas', type: 'textarea', req: true, ph: 'Materi yang diselesaikan, kedisiplinan, tugas yang dikumpulkan…' }],
    onSubmit: (v) => doSelesai(coverId, `[${v.kond}] ${v.note}`)
  });
}
function doSelesai(coverId, note) {
  const k = S.data.cover.find((x) => x.cover_id === coverId); if (!k) return;
  const before = clone(k);
  Object.assign(k, { status: 'SELESAI', catatan_selesai: note, selesai_pada: nowJakarta().iso, _pending: true }); reindex(); refreshView();
  toast('ok', 'Laporan terkirim', `${kelasName(k.kelas_id)} ditandai selesai.`);
  run('tandaiCoverSelesai', coverId, note).then((r) => { Object.assign(k, r.cover); delete k._pending; reindex(); refreshView(); })
    .catch((err) => { Object.keys(k).forEach((x) => delete k[x]); Object.assign(k, before); reindex(); refreshView(); toast('err', 'Laporan gagal dikirim', err.message); });
}

// ════════════════════════════════════════════════════════════════════════════
// 11. JADWAL TERM (PDF)
// ════════════════════════════════════════════════════════════════════════════
function renderJadwal() {
  const J = S.ui.jt;
  if (!J.tahun) J.tahun = termAktif().tahun_id || (S.master.tahun[0] || {}).tahun_id;
  const terms = S.master.term.filter((t) => t.tahun_id === J.tahun).sort((a, b) => Number(a.nomor) - Number(b.nomor));
  if (!J.term || !terms.some((t) => t.term_id === J.term)) J.term = (terms.find((t) => t.term_id === S.app.termAktif) || terms[0] || {}).term_id;
  const unitOpts = canAllUnits() ? S.idx.unitList.map((u) => u.unit_id) : [isDiri() ? S.me.unit_id : S.unit].filter(Boolean);
  if (!J.unit || !unitOpts.includes(J.unit)) J.unit = S.unit !== 'ALL' && unitOpts.includes(S.unit) ? S.unit : unitOpts[0];
  const canEdit = S.perm.kelola_jadwal_term;
  const files = S.data.jadwal.filter((j) => j.term_id === J.term && j.unit_id === J.unit).sort((a, b) => (a.status === b.status ? b.diunggah_pada.localeCompare(a.diunggah_pada) : a.status === 'AKTIF' ? -1 : 1));
  const tr = S.idx.term[J.term] || {};
  const kelasN = S.master.kelas.filter((k) => k.unit_id === J.unit && isOn(k.aktif)).length;
  const jams = S.idx.jamByUnit[J.unit] || [];
  const guruN = S.pegawai.filter((p) => p.aktif && p.unit_id === J.unit).length;
  const kepsek = S.pegawai.find((p) => p.unit_id === J.unit && p.peranKode === 'KEPSEK');

  $('#view-jadwal').innerHTML = `
    <div class="page-head"><div><div class="crumbs">${ico('table_view', 'sm')} <b>Dokumentasi Kurikulum &amp; Jadwal Akademik</b></div><h1>Manajemen Jadwal Pelajaran per Term</h1><p>Unggah dan arsipkan berkas jadwal pelajaran PDF per unit, tahun ajaran, dan term untuk konsistensi operasional kelas dan piket.</p></div>
      ${canEdit ? `<button class="btn-la btn-primary-la" onclick="App.uploadJadwal()">${ico('upload_file')} Unggah Berkas Jadwal Baru</button>` : ''}</div>
    <div class="card-la card-pad mb-4 d-flex flex-wrap gap-3 align-items-center justify-content-between">
      <div class="d-flex flex-wrap gap-3 align-items-center">
        <div><label class="small-xs muted d-block" for="jtTahun">Tahun Ajaran</label><select id="jtTahun" class="select-la" style="width:auto;font-weight:700" onchange="App.jt('tahun', this.value)">${S.master.tahun.map((t) => `<option value="${t.tahun_id}" ${t.tahun_id === J.tahun ? 'selected' : ''}>${esc(t.label)}${isOn(t.aktif) ? ' (Aktif)' : ''}</option>`).join('')}</select></div>
        <div class="seg solid" role="tablist">${terms.map((t) => `<button type="button" role="tab" class="${t.term_id === J.term ? 'active' : ''}" onclick="App.jt('term','${t.term_id}')">Term ${esc(t.nomor)}${t.term_id === S.app.termAktif ? ' •' : ''}</button>`).join('')}</div>
      </div>
      <div class="d-flex align-items-center gap-2 flex-wrap">${unitOpts.length > 1 ? `<div class="unit-pills">${unitOpts.map((u) => `<button type="button" class="${u === J.unit ? 'active' : ''}" onclick="App.jt('unit','${u}')">${esc(u)}</button>`).join('')}</div>` : `<span class="unit-lock"><span class="tag">${esc(J.unit)} ${ico('lock', 'sm')}</span>Menampilkan unit ${esc(J.unit)} saja</span>`}</div>
    </div>
    <div class="row g-4">
      <div class="col-xl-8">
        <div class="d-flex justify-content-between align-items-center mb-3"><h2>Daftar Berkas Jadwal <span class="chip unit">Term ${esc(tr.nomor || '')}</span></h2><span class="small-xs muted">${files.length} berkas terdata</span></div>
        ${files.length ? files.map((f) => { const arsip = f.status === 'ARSIP'; return `<div class="card-la doc-card mb-3"><div class="d-flex gap-3 align-items-start"><span class="doc-ico ${arsip ? 'arsip' : ''}">${ico(arsip ? 'inventory_2' : 'picture_as_pdf', 'xl')}</span><div style="min-width:0;flex:1">
            <div class="d-flex flex-wrap gap-2 align-items-center"><h3 style="font-size:17px;word-break:break-word">${esc(f.nama_berkas)}${pending(f)}</h3>${arsip ? '<span class="chip arsip">Arsip</span>' : '<span class="chip selesai">' + ico('check_circle', 'sm') + ' Aktif</span>'}<span class="chip neutral">${f.jenis === 'PIKET' ? 'Jadwal Piket' : 'Jadwal Pelajaran'}</span></div>
            <div class="small-xs muted mt-1">${esc(bytesLabel(Number(f.ukuran_kb || 0) * 1024))} • Diunggah oleh ${esc(nama(f.diunggah_oleh))} • ${esc(fmtDT(f.diunggah_pada))}</div></div></div>
          <div class="doc-foot"><span class="small-xs muted">${ico('folder', 'sm')} Drive / ${esc(J.unit)} / Term ${esc(tr.nomor || '')}</span><div class="d-flex flex-wrap gap-2">
            <button class="btn-la btn-soft btn-sm-la" onclick="App.preview('${esc(f.drive_file_id)}')" ${f._pending ? 'disabled' : ''}>${ico('visibility', 'sm')} Pratinjau</button>
            <button class="btn-la btn-soft btn-sm-la" onclick="App.preview('${esc(f.drive_file_id)}', true)" ${f._pending ? 'disabled' : ''}>${ico('download', 'sm')} Unduh PDF</button>
            ${canEdit && !arsip ? `<button class="btn-link-la" onclick="App.uploadJadwal('${f.jadwal_id}')">${ico('sync', 'sm')} Ganti Berkas</button><button class="btn-link-la" style="color:var(--muted)" onclick="App.arsipJadwal('${f.jadwal_id}')">${ico('archive', 'sm')} Arsipkan</button>` : ''}
            ${canEdit && arsip ? `<button class="btn-link-la" onclick="App.arsipJadwal('${f.jadwal_id}', true)">${ico('unarchive', 'sm')} Aktifkan</button>` : ''}</div></div></div>`; }).join('') : `<div class="card-la">${emptyState('upload_file', 'Belum ada berkas jadwal', canEdit ? 'Unggah PDF jadwal pelajaran untuk term & unit ini.' : 'Admin / TU belum mengunggah jadwal untuk term ini.')}</div>`}
      </div>
      <div class="col-xl-4">
        ${canEdit ? `<div class="card-la card-pad mb-3"><div class="d-flex justify-content-between mb-2"><h3>${ico('cloud_upload')} Unggah Cepat</h3><span class="small-xs muted">PDF maks. 10 MB</span></div>
          <p class="small-xs muted">Jadwal baru langsung tercatat untuk Term ${esc(tr.nomor || '')} unit ${esc(J.unit)}.</p>
          <label class="dropzone" id="jtDrop"><input type="file" accept="application/pdf" onchange="App.quickJadwal(this.files[0])" aria-label="Unggah PDF jadwal"><span class="dz-ico">${ico('note_add')}</span><b class="text-strong d-block">Pilih atau tarik berkas PDF</b><span class="small-xs muted">Otomatis ke Term ${esc(tr.nomor || '')} · ${esc(J.unit)}</span></label></div>` : ''}
        <div class="card-la card-pad"><h3 class="mb-3">${ico('verified')} Ringkasan Unit ${esc(J.unit)}</h3>
          <div class="kv"><span>Total rombel / kelas</span><span>${kelasN} kelas</span></div>
          <div class="kv"><span>Jam pelajaran / hari</span><span>${jams.length} jam${jams.length ? ` (${esc(jams[0].mulai)} – ${esc(jams[jams.length - 1].selesai)})` : ''}</span></div>
          <div class="kv"><span>Jumlah staf aktif</span><span>${guruN} orang</span></div>
          <div class="kv"><span>Periode term</span><span>${esc(fmtShort(tr.tanggal_mulai || S.today))} – ${esc(fmtMid(tr.tanggal_selesai || S.today))}</span></div>
          <div class="kv"><span>Penanggung jawab</span><span>${esc(kepsek ? kepsek.nama + ' (' + kepsek.jabatan + ')' : '—')}</span></div>
        </div>
      </div>
    </div>`;
  const dz = $('#jtDrop');
  if (dz) { dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); }; dz.ondragleave = () => dz.classList.remove('drag'); dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); quickJadwal(e.dataTransfer.files[0]); }; }
}

function doUploadJadwal(file, meta) {
  const err = checkFile(file, 10, ['application/pdf']);
  if (err) { toast('warn', 'Berkas tidak valid', err); return; }
  const tmp = { jadwal_id: uid(), tahun_id: (S.idx.term[meta.term_id] || {}).tahun_id, term_id: meta.term_id, unit_id: meta.unit_id, jenis: meta.jenis, nama_berkas: file.name, drive_file_id: '', ukuran_kb: Math.round(file.size / 1024), status: 'AKTIF', diunggah_oleh: S.me.id_pengguna, diunggah_pada: nowJakarta().iso, _pending: true };
  const old = meta.gantiId ? S.data.jadwal.find((j) => j.jadwal_id === meta.gantiId) : null;
  S.data.jadwal.push(tmp); if (old) old.status = 'ARSIP';
  refreshView();
  toast('info', 'Mengunggah jadwal…', file.name);
  readFile(file).then((f) => run('uploadJadwal', { name: f.name, mime: f.mime, data: f.data }, meta)).then((r) => {
    Object.assign(tmp, r.jadwal); delete tmp._pending; refreshView(); toast('ok', 'Jadwal terunggah', file.name);
  }).catch((e) => {
    S.data.jadwal = S.data.jadwal.filter((j) => j !== tmp); if (old) old.status = 'AKTIF'; refreshView(); toast('err', 'Unggah gagal', e.message);
  });
}
function quickJadwal(file) { const J = S.ui.jt; doUploadJadwal(file, { term_id: J.term, unit_id: J.unit, jenis: 'PELAJARAN' }); }
function uploadJadwal(gantiId) {
  const J = S.ui.jt;
  const old = gantiId ? S.data.jadwal.find((j) => j.jadwal_id === gantiId) : null;
  const unitOpts = canAllUnits() ? S.idx.unitList.map((u) => u.unit_id) : [S.unit];
  let picked = null;
  modal({
    title: old ? 'Ganti Berkas Jadwal' : 'Unggah Berkas Jadwal Baru', sub: old ? old.nama_berkas : 'PDF maks. 10 MB', icon: 'upload_file', size: 'md',
    body: `<form id="ujForm" novalidate><div class="row g-3">
      <div class="col-sm-6"><label class="form-label-la" for="ujTerm">Term</label><select class="select-la" id="ujTerm" ${old ? 'disabled' : ''}>${S.master.term.filter((t) => t.tahun_id === J.tahun).map((t) => `<option value="${t.term_id}" ${t.term_id === (old ? old.term_id : J.term) ? 'selected' : ''}>Term ${t.nomor}</option>`).join('')}</select></div>
      <div class="col-sm-6"><label class="form-label-la" for="ujUnit">Unit</label><select class="select-la" id="ujUnit" ${old ? 'disabled' : ''}>${unitOpts.map((u) => `<option ${u === (old ? old.unit_id : J.unit) ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      <div class="col-12"><label class="form-label-la" for="ujJenis">Jenis Jadwal</label><select class="select-la" id="ujJenis" ${old ? 'disabled' : ''}><option value="PELAJARAN">Jadwal Pelajaran</option><option value="PIKET" ${old && old.jenis === 'PIKET' ? 'selected' : ''}>Jadwal Guru Piket (dokumen)</option></select></div>
      <div class="col-12"><label class="dropzone" id="ujDrop"><input type="file" accept="application/pdf" id="ujFile" aria-label="Pilih PDF"><span class="dz-ico">${ico('picture_as_pdf')}</span><b class="text-strong d-block" id="ujName">Pilih atau tarik berkas PDF</b><span class="small-xs muted">Maksimal 10 MB</span></label></div>
      ${old ? '<div class="col-12"><div class="info-box">' + ico('info') + '<div>Berkas lama otomatis menjadi <b>Arsip</b>.</div></div></div>' : ''}</div></form>`,
    foot: `<button class="btn-la btn-ghost" data-bs-dismiss="modal">Batal</button><button class="btn-la btn-primary-la" id="ujOk">${ico('upload')} Unggah</button>`,
    onShow: () => {
      const setF = (f) => { picked = f; $('#ujName').textContent = f ? `${f.name} (${bytesLabel(f.size)})` : 'Pilih atau tarik berkas PDF'; };
      $('#ujFile').onchange = (e) => setF(e.target.files[0]);
      const dz = $('#ujDrop'); dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); }; dz.ondragleave = () => dz.classList.remove('drag'); dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); setF(e.dataTransfer.files[0]); };
      $('#ujOk').onclick = () => {
        const err = checkFile(picked, 10, ['application/pdf']);
        if (err) { toast('warn', 'Berkas belum valid', err); return; }
        closeModal();
        doUploadJadwal(picked, old ? { term_id: old.term_id, unit_id: old.unit_id, jenis: old.jenis, gantiId: old.jadwal_id } : { term_id: $('#ujTerm').value, unit_id: $('#ujUnit').value, jenis: $('#ujJenis').value });
      };
    }
  });
}
function arsipJadwal(id, aktifkan) {
  const j = S.data.jadwal.find((x) => x.jadwal_id === id); if (!j) return;
  const prev = j.status; j.status = aktifkan ? 'AKTIF' : 'ARSIP'; refreshView();
  toast('ok', aktifkan ? 'Jadwal diaktifkan' : 'Jadwal diarsipkan', j.nama_berkas);
  run('arsipkanJadwal', id, !!aktifkan).catch((e) => { j.status = prev; refreshView(); toast('err', 'Gagal', e.message); });
}

// ── Pratinjau berkas di modal (gambar & PDF via pdf.js) ────────────────────
const previewCache = new Map();
let pdfjsReady = null;
function loadPdfJs() {
  if (pdfjsReady) return pdfjsReady;
  const base = 'https:' + String.fromCharCode(47, 47) + 'cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  pdfjsReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = base + 'pdf.min.js';
    s.onload = () => {
      const lib = window.pdfjsLib;
      fetch(base + 'pdf.worker.min.js').then((r) => r.text()).then((code) => {
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        resolve(lib);
      }).catch(() => { lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; resolve(lib); });
    };
    s.onerror = () => { pdfjsReady = null; reject(new Error('Pustaka PDF gagal dimuat.')); };
    document.head.appendChild(s);
  });
  return pdfjsReady;
}
function b64ToBytes(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
async function preview(fileId, downloadOnly) {
  if (!fileId) return;
  const stage = $('#previewStage');
  let f = previewCache.get(fileId);
  if (!downloadOnly) {
    $('#previewTitle').textContent = f ? f.name : 'Memuat berkas…';
    stage.innerHTML = `<div class="skel" style="width:100%;max-width:640px;height:60vh"></div>`;
    bootstrap.Modal.getOrCreateInstance($('#modalPreview')).show();
  } else toast('info', 'Menyiapkan unduhan…');
  try {
    if (!f) { f = await run('getPreviewBerkas', fileId); previewCache.set(fileId, f); if (previewCache.size > 6) previewCache.delete(previewCache.keys().next().value); }
    const blob = () => new Blob([b64ToBytes(f.data)], { type: f.mime });
    $('#previewDownload').onclick = () => downloadBlob(blob(), f.name);
    if (downloadOnly) { downloadBlob(blob(), f.name); return; }
    $('#previewTitle').textContent = f.name;
    if (f.mime.indexOf('image/') === 0) { stage.innerHTML = `<img src="data:${f.mime};base64,${f.data}" alt="${esc(f.name)}">`; return; }
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: b64ToBytes(f.data) }).promise;
    stage.innerHTML = `<div class="small-xs muted">${pdf.numPages} halaman</div>`;
    const width = Math.min(stage.clientWidth - 24, 1000);
    for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
      const page = await pdf.getPage(i);
      const vp0 = page.getViewport({ scale: 1 });
      const scale = (width / vp0.width) * (window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.style.width = width + 'px';
      stage.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) {
    stage.innerHTML = emptyState('error', 'Pratinjau tidak tersedia', e.message + (f ? ' Gunakan tombol Unduh.' : ''));
    if (downloadOnly) toast('err', 'Gagal mengunduh', e.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 12. REKAP GURU
// ════════════════════════════════════════════════════════════════════════════
function rekapRange() {
  const R = S.ui.rek;
  if (!R.tahun) R.tahun = termAktif().tahun_id;
  if (R.term === '' && !R.mulai) R.term = S.app.termAktif || '';
  const t = S.idx.term[R.term], ta = S.idx.tahun[R.tahun] || {};
  let mulai = R.mulai || (t ? t.tanggal_mulai : ta.tanggal_mulai) || addDays(S.today, -30);
  let selesai = R.selesai || (t ? t.tanggal_selesai : ta.tanggal_selesai) || S.today;
  if (selesai > S.today) selesai = S.today;
  if (mulai > selesai) mulai = selesai;
  return { mulai, selesai };
}
function dataForRange(mulai, selesai) {
  if (mulai >= S.boot.wStart) return { absen: S.data.absen, cover: S.data.cover };
  const key = mulai + '_' + selesai;
  const ex = S.extra[key];
  if (ex && ex.data) return { absen: ex.data.absen, cover: ex.data.cover };
  if (!ex) {
    S.extra[key] = { loading: true };
    run('getDataPeriode', mulai, selesai).then((r) => { S.extra[key] = r; Object.assign(S.names, r.names || {}); reindex(); if (S.page === 'rekap' || S.page === 'rekapDetail') render(S.page); })
      .catch((e) => { delete S.extra[key]; toast('err', 'Gagal memuat periode', e.message); });
  }
  return null;
}
function computeRekap(mulai, selesai, units, onlyId) {
  const d = dataForRange(mulai, selesai);
  if (!d) return null;
  const set = new Set(units);
  let peg = isDiri() ? S.pegawai.filter((p) => p.id_pengguna === S.me.id_pengguna) : S.pegawai.filter((p) => p.aktif && set.has(p.unit_id));
  if (onlyId) peg = S.pegawai.filter((p) => p.id_pengguna === onlyId);
  if (S.ui.rek.jenis && !onlyId) peg = peg.filter((p) => p.jenis_id === S.ui.rek.jenis);
  const per = {};
  peg.forEach((p) => { per[p.id_pengguna] = { p, hk: countHK(mulai, selesai, p.unit_id), sakit: 0, izinP: 0, izinT: 0, alfa: 0, jam: 0, jamCover: 0, kasus: 0, entries: [] }; });
  const days = [0, 0, 0, 0, 0];
  let sakit = 0, izinP = 0, izinT = 0, alfa = 0;
  d.absen.forEach((a) => {
    const r = per[a.pengguna_id];
    if (!r || a.status === 'DIBATALKAN' || a.tanggal_berakhir < mulai || a.tanggal_mulai > selesai) return;
    r.kasus++; r.entries.push(a);
    const from = a.tanggal_mulai < mulai ? mulai : a.tanggal_mulai, to = a.tanggal_berakhir > selesai ? selesai : a.tanggal_berakhir;
    for (let t = from; t <= to; t = addDays(t, 1)) {
      if (!hariKerja(t, a.unit_id)) continue;
      days[dow(t) - 1]++;
      if (a.jenis === 'SAKIT') { r.sakit++; sakit++; } else if (a.jenis === 'ALFA') { r.alfa++; alfa++; } else if (a.sub_izin === 'TUGAS_SEKOLAH') { r.izinT++; izinT++; } else { r.izinP++; izinP++; }
    }
  });
  let jam = 0, jamCover = 0, coverSelesai = 0, coverTotal = 0;
  d.cover.forEach((k) => {
    const r = per[k.guru_utama_id];
    const ab = S.idx.absen[k.absen_id];
    if (!r || k.tanggal < mulai || k.tanggal > selesai || (ab && ab.status === 'DIBATALKAN')) return;
    const jp = jamInfo(k).jp;
    r.jam += jp; jam += jp; coverTotal++;
    if (k.status !== 'BELUM_DITUGASKAN') { r.jamCover += jp; jamCover += jp; }
    if (k.status === 'SELESAI') coverSelesai++;
  });
  const rows = Object.values(per).map((r) => Object.assign(r, { izin: r.izinP + r.izinT, total: r.sakit + r.izinP + r.izinT + r.alfa }));
  const hkTotal = rows.reduce((s, r) => s + r.hk, 0);
  const absTotal = rows.reduce((s, r) => s + r.total, 0);
  return { rows, days, sakit, izinP, izinT, alfa, izin: izinP + izinT, total: sakit + izinP + izinT + alfa, jam, jamCover, coverSelesai, coverTotal, hkTotal, absTotal, tingkat: hkTotal ? (hkTotal - absTotal) / hkTotal * 100 : 100, cover: d.cover };
}

function rekapFilterBar(locked) {
  const R = S.ui.rek, rg = rekapRange();
  const terms = S.master.term.filter((t) => t.tahun_id === R.tahun).sort((a, b) => Number(a.nomor) - Number(b.nomor));
  return `<div class="card-la card-pad mb-4 no-print"><div class="row g-3 align-items-end">
    <div class="col-lg-3"><div class="small-xs muted fw-semibold mb-1">Cakupan Unit Sekolah</div>${locked}</div>
    <div class="col-6 col-lg-2"><label class="small-xs muted fw-semibold mb-1 d-block" for="rkTahun">Tahun Ajaran</label><select id="rkTahun" class="select-la" onchange="App.rk('tahun', this.value)">${S.master.tahun.map((t) => `<option value="${t.tahun_id}" ${t.tahun_id === R.tahun ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
    <div class="col-6 col-lg-3"><div class="small-xs muted fw-semibold mb-1">Term</div><div class="seg">${[{ term_id: '', nomor: 'Semua' }].concat(terms).map((t) => `<button type="button" class="${R.term === t.term_id && !R.mulai ? 'active' : ''}" onclick="App.rk('term','${t.term_id}')">${t.term_id ? 'T' + t.nomor : 'Semua'}</button>`).join('')}</div></div>
    <div class="col-lg-4"><div class="small-xs muted fw-semibold mb-1">Rentang Tanggal</div><div class="d-flex gap-2 align-items-center"><input type="date" class="input-la" value="${rg.mulai}" onchange="App.rk('mulai', this.value)" aria-label="Tanggal mulai"><span class="muted">–</span><input type="date" class="input-la" value="${rg.selesai}" max="${S.today}" onchange="App.rk('selesai', this.value)" aria-label="Tanggal selesai"><button class="icon-btn" onclick="App.rk('reset')" aria-label="Atur ulang rentang">${ico('restart_alt')}</button></div></div>
  </div></div>`;
}

function renderRekap() {
  if (isDiri()) { S.detailId = S.me.id_pengguna; return renderRekapDetail(true); }
  const R = S.ui.rek, rg = rekapRange(), units = activeUnits();
  const c = computeRekap(rg.mulai, rg.selesai, units);
  const lockedHtml = !canAllUnits() ? `<span class="btn-la btn-primary-la btn-sm-la" style="pointer-events:none">${esc(S.unit)} (${esc((S.idx.unit[S.unit] || {}).nama_lengkap || '')}) ${ico('lock', 'sm')}</span><div class="small-xs muted mt-1">${ico('info', 'sm')} Menampilkan unit ${esc(S.unit)} saja sesuai hak akses ${esc(S.me.jabatan)}</div>` : `<span class="chip unit">${esc(S.unit === 'ALL' ? 'Semua Unit' : S.unit)}</span><div class="small-xs muted mt-1">Ubah unit pada pemilih di bagian atas.</div>`;
  if (!c) { $('#view-rekap').innerHTML = rekapHead() + rekapFilterBar(lockedHtml) + `<div class="row g-3">${[1, 2, 3].map(() => '<div class="col-md-4"><div class="skel" style="height:150px"></div></div>').join('')}</div><div class="skel mt-3" style="height:320px"></div>`; return; }

  const q = R.q.toLowerCase();
  let rows = c.rows.filter((r) => !q || r.p.nama.toLowerCase().includes(q) || String(r.p.bidang_studi).toLowerCase().includes(q));
  const sorters = { nama: (r) => r.p.nama, unit: (r) => r.p.unit_id, sakit: (r) => r.sakit, izin: (r) => r.izin, alfa: (r) => r.alfa, jam: (r) => r.jam, total: (r) => r.total };
  const sf = sorters[R.sort] || sorters.total;
  rows.sort((a, b) => { const x = sf(a), y = sf(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * R.dir || a.p.nama.localeCompare(b.p.nama); });
  const size = 12, pages = Math.max(1, Math.ceil(rows.length / size));
  if (R.page > pages) R.page = pages;
  const view = rows.slice((R.page - 1) * size, R.page * size);
  const tot = c.total || 1;
  const peakIdx = c.days.indexOf(Math.max(...c.days));
  const daysTotal = c.days.reduce((a, b) => a + b, 0);
  const topDays = c.days.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 2).filter((x) => x.v);
  const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
  const dominant = [['Sakit', c.sakit], ['Izin Pribadi', c.izinP], ['Izin Tugas Sekolah', c.izinT], ['Alfa', c.alfa]].sort((a, b) => b[1] - a[1])[0];
  const th = (k, l) => `<th class="sortable" onclick="App.rkSort('${k}')" aria-sort="${R.sort === k ? (R.dir > 0 ? 'ascending' : 'descending') : 'none'}">${l} ${R.sort === k ? ico(R.dir > 0 ? 'arrow_upward' : 'arrow_downward', 'sm') : ''}</th>`;

  $('#view-rekap').innerHTML = rekapHead() + rekapFilterBar(lockedHtml) + `
    ${rg.mulai < S.boot.wStart ? `<div class="info-box mb-3">${ico('history')}<div>Data periode lama dimuat dari server.</div></div>` : ''}
    <div class="row g-3 mb-4">
      <div class="col-md-4"><div class="card-la stat-card"><div class="stat-top"><span class="eyebrow" style="color:var(--text-2)">Total Jam Ditinggalkan</span><span class="stat-ico ico-sakit">${ico('event_busy')}</span></div><div class="stat-value">${c.jam}<small>Jam / Sesi Pelajaran</small></div><div class="kv"><span>Tercakup oleh rekan guru</span><span style="color:var(--ok-fg)">${c.jamCover} Jam (${pct(c.jamCover, c.jam || 1, 0)})</span></div></div></div>
      <div class="col-md-4"><div class="card-la stat-card"><div class="stat-top"><span class="eyebrow" style="color:var(--text-2)">Cover Lesson Selesai</span><span class="stat-ico ico-cover">${ico('swap_horiz')}</span></div><div class="stat-value" style="color:var(--cover)">${c.coverSelesai}<small>dari ${c.coverTotal} penugasan</small></div><div class="kv"><span>Status cover</span><span style="color:var(--ok-fg)">${pct(c.coverSelesai, c.coverTotal || 1, 0)} Tuntas</span></div></div></div>
      <div class="col-md-4"><div class="card-la stat-card"><div class="stat-top"><span class="eyebrow" style="color:var(--text-2)">Tingkat Kehadiran Kumulatif</span><span class="stat-ico ico-hadir">${ico('verified')}</span></div><div class="stat-value" style="color:var(--ok-fg)">${c.tingkat.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%${c.tingkat >= S.app.target ? `<span class="chip selesai">${ico('check', 'sm')} Sesuai Target</span>` : '<span class="chip gagal">Di Bawah Target</span>'}</div><div class="kv"><span>Target minimum institusi</span><span>≥ ${S.app.target}%</span></div></div></div>
    </div>
    <div class="row g-3 mb-4">
      <div class="col-lg-5"><div class="card-la card-pad h-100"><div class="card-head"><div><h2>Distribusi Alasan Absensi</h2><p>Pengelompokan izin bertumpuk &amp; ketidakhadiran</p></div><span class="chip neutral">Total ${c.total} hari</span></div>
        <div class="d-flex justify-content-between small-xs fw-semibold mb-2"><span>Proporsi Komposisi</span><span>100% Tercatat</span></div>
        <div class="split-bar mb-3"><i style="width:${c.sakit / tot * 100}%;background:var(--sick-bg);box-shadow:inset 0 0 0 1px var(--sick)"></i><i style="width:${c.izinP / tot * 100}%;background:var(--izin-line)"></i><i style="width:${c.izinT / tot * 100}%;background:#D97706"></i><i style="width:${c.alfa / tot * 100}%;background:var(--primary-strong)"></i></div>
        <div class="legend-row"><span class="dot-c" style="background:var(--sick)"></span><div class="lb"><b>Sakit (Kondisi Medis)</b></div><div class="vl">${c.sakit} Hari <small class="muted">(${pct(c.sakit, tot)})</small></div></div>
        <div class="legend-row d-block"><div class="d-flex gap-2 align-items-center mb-2">${ico('folder_open')}<b class="text-strong">Kelompok Izin (Total: ${c.izin} hari / ${pct(c.izin, tot)})</b></div>
          <div class="piket-item"><span><span class="dot-c" style="background:var(--izin-line)"></span> Izin Pribadi (Keluarga / Darurat)</span><b class="text-strong">${c.izinP} (${pct(c.izinP, c.izin || 1, 0)})</b></div>
          <div class="piket-item"><span><span class="dot-c" style="background:#D97706"></span> Izin Tugas Sekolah (Pelatihan / Lomba)</span><b class="text-strong">${c.izinT} (${pct(c.izinT, c.izin || 1, 0)})</b></div></div>
        <div class="legend-row"><span class="dot-c" style="background:var(--primary-strong)"></span><div class="lb"><b>Alfa (Tanpa Keterangan)</b></div><div class="vl">${c.alfa} Hari <small class="muted">(${pct(c.alfa, tot)})</small></div></div>
      </div></div>
      <div class="col-lg-7"><div class="card-la card-pad h-100 d-flex flex-column"><div class="card-head"><div><h2>${ico('view_week')} Hari Paling Sering Terjadi Ketidakhadiran</h2><p>Distribusi frekuensi ketidakhadiran Senin s/d Jumat · ${esc(fmtMid(rg.mulai))} – ${esc(fmtMid(rg.selesai))}</p></div></div>
        <div class="chart-box" style="height:260px;flex:1"><canvas id="chDays" role="img" aria-label="Grafik ketidakhadiran per hari"></canvas></div>
        <div class="insight mt-3">${ico('lightbulb')}<div><b>Insight Analitik:</b> ${daysTotal ? `Tingkat absensi tertinggi terjadi di hari ${topDays.map((x) => `<b>${dayNames[x.i]} (${pct(x.v, daysTotal, 0)})</b>`).join(' dan ')}, didominasi oleh ${esc(dominant[0].toLowerCase())}.` : 'Belum ada ketidakhadiran pada periode ini.'}</div></div>
      </div></div>
    </div>
    <div class="card-la">
      <div class="card-pad pb-3 d-flex flex-wrap gap-2 justify-content-between align-items-center no-print">
        <div class="d-flex gap-2 flex-wrap"><div class="search-box" style="min-width:260px">${ico('search')}<input class="input-la" placeholder="Cari nama pengajar, bidang studi…" value="${esc(R.q)}" oninput="App.rkSearch(this.value)" aria-label="Cari pengajar"></div>
          <select class="select-la" style="width:auto" onchange="App.rk('jenis', this.value)" aria-label="Jenis pegawai"><option value="">Semua Jenis</option>${S.master.jenis.map((j) => `<option value="${j.jenis_id}" ${R.jenis === j.jenis_id ? 'selected' : ''}>${esc(j.nama)}</option>`).join('')}</select></div>
        <span class="small-xs muted">Menampilkan ${view.length} dari ${rows.length} pegawai</span>
      </div>
      <div class="table-wrap px-2"><table class="table-la table-cards"><thead><tr>${th('nama', 'Nama Guru &amp; Departemen')}${th('unit', 'Unit')}${th('sakit', 'Sakit')}${th('izin', 'Izin (Pribadi / Tugas)')}${th('alfa', 'Alfa')}${th('jam', 'Total Jam Cover')}<th class="text-end">Aksi</th></tr></thead><tbody>
        ${view.map((r) => `<tr>
          <td class="td-main"><div class="person">${avatar(r.p.id_pengguna, r.p.nama)}<div><div class="nm">${esc(r.p.nama)}</div><div class="sub">${esc(r.p.bidang_studi || r.p.jabatan || '')}</div></div></div></td>
          <td data-label="Unit"><span class="chip unit">${esc(r.p.unit_id)}</span></td>
          <td data-label="Sakit">${r.sakit ? `<span class="chip sakit">${r.sakit} Hari</span>` : '<span class="muted">—</span>'}</td>
          <td data-label="Izin" style="min-width:170px"><div class="d-flex justify-content-between small-xs"><b class="text-strong">Total: ${r.izin} Hari</b><span class="muted">${r.izinP} Prb / ${r.izinT} Tgs</span></div>${r.izin ? `<div class="mini-bar mt-1"><i style="width:${r.izinP / r.izin * 100}%"></i><i style="width:${r.izinT / r.izin * 100}%"></i></div>` : ''}</td>
          <td data-label="Alfa">${r.alfa ? `<span class="chip alfa">${r.alfa} Hari</span>` : '<span class="muted">—</span>'}</td>
          <td data-label="Jam Cover" class="text-center"><b class="text-strong">${r.jam} Jam</b><div class="small-xs" style="color:${r.jam - r.jamCover ? 'var(--sick-fg)' : 'var(--ok-fg)'}">${r.jam ? (r.jam - r.jamCover ? `${r.jam - r.jamCover} Jam Tertunda` : '100% Tercakup') : '—'}</div></td>
          <td data-label="Aksi" class="text-end"><button class="btn-la btn-soft btn-sm-la" onclick="App.go('rekapDetail',{id:'${r.p.id_pengguna}'})">${ico('visibility', 'sm')} Lihat Detail</button></td></tr>`).join('') || `<tr><td colspan="7">${emptyState('person_search', 'Tidak ada data', '')}</td></tr>`}
      </tbody></table></div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 px-4 py-3"><span class="small-xs muted"><span class="dot-c" style="background:var(--ok)"></span> Data periode ${esc(fmtMid(rg.mulai))} – ${esc(fmtMid(rg.selesai))} dihitung dari hari kerja (Senin–Jumat, dikurangi hari libur).</span>${pager(pages, R.page, 'App.rkPage')}</div>
    </div>`;
  drawBars('chDays', ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'], c.days, c.days[peakIdx] ? peakIdx : -1);
}
function rekapHead() {
  return `<div class="page-head"><div><div class="crumbs">Laporan Akademik <span class="msi sm">chevron_right</span> <b>Rekap Guru &amp; Kehadiran</b></div><h1>Rekapitulasi Kehadiran &amp; Jam Pengganti</h1><p>Pantau rasio presensi, komposisi ketidakhadiran, dan efisiensi cover lesson.</p></div>
    <div class="d-flex gap-2 no-print"><button class="btn-la btn-primary-la" onclick="App.exportRekap()">${ico('ios_share')} Ekspor Rekap Laporan</button></div></div>`;
}
function exportRekap() {
  const rg = rekapRange();
  const c = computeRekap(rg.mulai, rg.selesai, activeUnits());
  if (!c) { toast('info', 'Data periode sedang dimuat…'); return; }
  const rows = [['Periode', `${rg.mulai} s/d ${rg.selesai}`], [], ['Nama', 'Unit', 'Bidang', 'Hari Kerja', 'Sakit', 'Izin Pribadi', 'Izin Tugas Sekolah', 'Alfa', 'Total Hari Absen', 'Tingkat Kehadiran (%)', 'Jam Ditinggalkan', 'Jam Tercover']];
  c.rows.forEach((r) => rows.push([r.p.nama, r.p.unit_id, r.p.bidang_studi, r.hk, r.sakit, r.izinP, r.izinT, r.alfa, r.total, r.hk ? ((r.hk - r.total) / r.hk * 100).toFixed(1) : '100', r.jam, r.jamCover]));
  rows.push([], ['Hari', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'], ['Jumlah'].concat(c.days));
  downloadCSV(rows, `Rekap_Guru_${S.unit}_${rg.mulai}_${rg.selesai}.csv`);
  toast('ok', 'Rekap diekspor', `${c.rows.length} pegawai.`);
}

function renderRekapDetail(self) {
  const id = S.detailId || S.me.id_pengguna;
  const target = self ? $('#view-rekap') : $('#view-rekapDetail');
  const p = pegById(id);
  if (!p.id_pengguna) { target.innerHTML = emptyState('person_off', 'Pegawai tidak ditemukan', ''); return; }
  const rg = rekapRange();
  const c = computeRekap(rg.mulai, rg.selesai, [p.unit_id], id);
  if (!c) { target.innerHTML = '<div class="skel" style="height:420px"></div>'; return; }
  const r = c.rows[0] || { sakit: 0, izinP: 0, izinT: 0, izin: 0, alfa: 0, total: 0, hk: 0, jam: 0, jamCover: 0, entries: [] };
  const rate = r.hk ? (r.hk - r.total) / r.hk * 100 : 100;
  const myCovers = c.cover.filter((k) => k.guru_utama_id === id && k.tanggal >= rg.mulai && k.tanggal <= rg.selesai);
  const comp = {};
  myCovers.filter((k) => k.guru_piket_id).forEach((k) => { comp[k.guru_piket_id] = (comp[k.guru_piket_id] || 0) + jamInfo(k).jp; });
  const compTotal = Object.values(comp).reduce((a, b) => a + b, 0);
  const entries = r.entries.slice().sort((a, b) => b.tanggal_mulai.localeCompare(a.tanggal_mulai));
  const sakitBerkas = entries.filter((a) => a.jenis === 'SAKIT' && a.berkas_id).length;
  const tr = S.idx.term[S.ui.rek.term];
  const ta = S.idx.tahun[S.ui.rek.tahun] || {};
  const jenisNm = (S.idx.jenis[p.jenis_id] || {}).nama || '';

  target.innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 no-print">
      <div class="crumbs mb-0">${self ? 'Rekap Pribadi' : `<button class="btn-link-la" onclick="App.go('rekap')">${ico('arrow_back', 'sm')} Kembali ke Daftar Rekap Guru</button>`}</div>
      <div class="d-flex gap-2"><button class="btn-la btn-ghost btn-sm-la" onclick="window.print()">${ico('print', 'sm')} Cetak PDF</button></div></div>
    ${self ? rekapFilterBar(`<span class="unit-lock"><span class="tag">${esc(p.unit_id)} ${ico('lock', 'sm')}</span>Data pribadi</span>`) : ''}
    <div class="card-la card-pad mb-4"><div class="d-flex flex-wrap gap-4 justify-content-between align-items-center">
      <div class="profile-head">${avatar(p.id_pengguna, p.nama, 'lg')}<div><h1>${esc(p.nama)}</h1><div style="color:var(--text-2)">${esc(p.bidang_studi || '')} (${esc(p.unit_id)})</div>
        <div class="meta-line">${p.email ? `<span>${ico('mail', 'sm')} ${esc(p.email)}</span>` : ''}<span>${ico('badge', 'sm')} ${esc(p.jabatan || jenisNm)}</span>${jenisNm ? `<span>${ico('work', 'sm')} ${esc(jenisNm)}</span>` : ''}</div></div></div>
      <div class="panel-tint text-end"><div class="eyebrow" style="color:var(--muted)">Periode</div><div class="text-strong" style="font-size:16px">${ico('date_range', 'sm')} T.A. ${esc(ta.label || '')}${tr && !S.ui.rek.mulai ? ' • Term ' + esc(tr.nomor) : ''}</div><div class="small-xs muted">${esc(fmtD(rg.mulai))} s/d ${esc(fmtD(rg.selesai))}</div></div>
    </div></div>
    <div class="row g-3 mb-4">
      <div class="col-6 col-lg"><div class="card-la stat-card"><div class="stat-top"><span class="eyebrow" style="color:var(--text-2)">Tingkat Kehadiran</span><span class="stat-ico ico-primary">${ico('how_to_reg')}</span></div><div class="stat-value">${rate.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</div><div class="bar thick"><i style="width:${rate}%;background:${rate >= S.app.target ? 'var(--ok)' : 'var(--sick)'}"></i></div><div class="stat-foot">${r.hk} hari kerja dalam periode</div></div></div>
      <div class="col-6 col-lg"><div class="card-la stat-card"><div class="stat-top"><span class="eyebrow" style="color:var(--text-2)">Total Hari Sakit</span><span class="stat-ico ico-sakit">${ico('medical_services')}</span></div><div class="stat-value">${r.sakit}<small>Hari</small></div><div class="stat-foot">${sakitBerkas ? ico('check_circle', 'sm') + ' ' + sakitBerkas + ' kasus surat dokter terlampir' : 'Tanpa lampiran surat'}</div></div></div>
      <div class="col-6 col-lg"><div class="card-la stat-card"><div class="stat-top"><span class="eyebrow" style="color:var(--text-2)">Total Izin</span><span class="stat-ico ico-izin">${ico('event_note')}</span></div><div class="stat-value">${r.izin}<small>Hari</small></div><div class="stat-foot"><div class="d-flex justify-content-between"><span>Izin Tugas</span><b class="text-strong">${r.izinT}</b></div><div class="d-flex justify-content-between"><span>Izin Pribadi</span><b class="text-strong">${r.izinP}</b></div></div></div></div>
      <div class="col-6 col-lg"><div class="card-la stat-card"><div class="stat-top"><span class="eyebrow" style="color:var(--text-2)">Alfa / Tanpa Keterangan</span><span class="stat-ico ico-alfa">${ico('shield')}</span></div><div class="stat-value">${r.alfa}<small>Hari</small></div><div class="stat-foot">${r.alfa ? '<span class="chip alfa">Perlu pembinaan</span>' : '<span class="chip selesai">' + ico('verified', 'sm') + ' Bersih / Disiplin Tinggi</span>'}</div></div></div>
      <div class="col-12 col-lg"><div class="card-la stat-card"><div class="stat-top"><span class="eyebrow" style="color:var(--text-2)">Cover Diberikan</span><span class="stat-ico ico-cover">${ico('swap_horiz')}</span></div><div class="stat-value">${r.jamCover}<small>Jam Pelajaran</small></div><div class="stat-foot">${r.jam ? (r.jam === r.jamCover ? ico('check', 'sm') + ' 100% terlaksana oleh piket' : (r.jam - r.jamCover) + ' jam belum dicover') : 'Tidak ada kelas ditinggalkan'}</div></div></div>
    </div>
    <div class="row g-4">
      <div class="col-xl-8"><div class="card-la">
        <div class="card-pad pb-3 d-flex justify-content-between align-items-center"><h2>${ico('menu_book')} Buku Catatan Ketidakhadiran <span class="chip unit">${entries.length} Entri</span></h2></div>
        ${entries.length ? `<div class="table-wrap px-2"><table class="table-la table-cards"><thead><tr><th>Tanggal &amp; Hari</th><th>Jenis Izin</th><th>Alasan Lengkap</th><th>Kelas Terdampak</th><th>Guru Pengganti</th></tr></thead><tbody>
          ${entries.map((a) => { const cv = (S.idx.coverByAbsen[a.absen_id] || myCovers.filter((k) => k.absen_id === a.absen_id)); return `<tr style="cursor:pointer" onclick="App.detailAbsen('${a.absen_id}')">
            <td class="td-main"><b class="text-strong">${esc(fmtD(a.tanggal_mulai))}${a.tanggal_berakhir !== a.tanggal_mulai ? ' – ' + esc(fmtD(a.tanggal_berakhir)) : ''}</b><div class="small-xs muted">${esc(HARI[dow(a.tanggal_mulai)])} • ${a.cakupan === 'SEBAGIAN' ? 'Sebagian hari' : 'Seharian'}</div></td>
            <td data-label="Jenis">${jenisChip(a, true)}</td><td data-label="Alasan" style="max-width:220px"><span class="d-inline-block text-truncate" style="max-width:220px">${esc(a.alasan)}</span></td>
            <td data-label="Kelas">${cv.length ? cv.map((k) => `<span class="cell-tag me-1">${esc(kelasName(k.kelas_id))}</span><div class="small-xs muted">${esc(k.mata_pelajaran)} (${jamInfo(k).jp} JP)</div>`).join('') : '<span class="muted">—</span>'}</td>
            <td data-label="Pengganti">${[...new Set(cv.map((k) => k.guru_piket_id).filter(Boolean))].map((g) => `<div class="person">${avatar(g, nama(g), 'sm')}<span class="small-xs text-strong">${esc(nama(g))}</span></div>`).join('') || '<span class="muted">—</span>'}</td></tr>`; }).join('')}
        </tbody></table></div>` : emptyState('verified', 'Tidak ada catatan ketidakhadiran', 'pada periode ini.')}
        <div class="px-4 py-3 small-xs muted">Menampilkan ${entries.length} catatan riwayat ketidakhadiran.</div>
      </div></div>
      <div class="col-xl-4">
        <div class="card-la card-pad mb-3"><div class="d-flex justify-content-between mb-2"><h3>${ico('pie_chart')} Komposisi Pengganti</h3><span class="small-xs muted">${compTotal} JP Total</span></div>
          <p class="small-xs muted">Guru piket pengganti yang paling sering mengawal kelas ${esc(shortName(p.nama))} pada periode ini.</p>
          ${Object.keys(comp).length ? Object.entries(comp).sort((a, b) => b[1] - a[1]).map(([g, jp]) => `<div class="legend-row">${avatar(g, nama(g), 'sm')}<div class="lb"><b>${esc(nama(g))}</b><small>${jp} JP</small></div><span class="chip unit">${pct(jp, compTotal)}</span></div>`).join('') : emptyState('group_off', 'Belum ada pengganti', '')}
        </div>
        ${(S.data.riwayat || []).some((x) => entries.some((a) => a.absen_id === x.absen_id)) ? `<div class="card-la card-pad"><h3 class="mb-2">${ico('history')} Riwayat Perubahan Status</h3>${S.data.riwayat.filter((x) => entries.some((a) => a.absen_id === x.absen_id)).map((x) => `<div class="notif-row"><div><b>${esc(x.status_lama)} → ${esc(x.status_baru)}</b><small>${esc(x.diubah_oleh)} · ${esc(fmtDT(x.waktu))}</small></div></div>`).join('')}</div>` : ''}
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// 13. ADMIN: PENGGUNA & PERAN
// ════════════════════════════════════════════════════════════════════════════
const MASTER_CFG = {
  Unit: { id: 'unit_id', title: 'Unit Sekolah', icon: 'domain', cols: ['unit_id', 'nama_lengkap', 'setara', 'aktif'], fields: [{ k: 'unit_id', l: 'Kode Unit', req: true, ph: 'mis. HS', lockEdit: true, col: 'col-sm-4' }, { k: 'nama_lengkap', l: 'Nama Lengkap', req: true, col: 'col-sm-8' }, { k: 'setara', l: 'Setara', ph: 'TK / SD / SMP / SMA', col: 'col-sm-4' }, { k: 'urutan', l: 'Urutan', type: 'number', col: 'col-sm-4' }, { k: 'aktif', l: 'Aktif', type: 'bool', def: true, col: 'col-sm-4' }] },
  TahunAjaran: { id: 'tahun_id', title: 'Tahun Ajaran', icon: 'calendar_month', cols: ['label', 'tanggal_mulai', 'tanggal_selesai', 'aktif'], fields: [{ k: 'label', l: 'Label', req: true, ph: '2026/2027' }, { k: 'tanggal_mulai', l: 'Mulai', type: 'date', req: true, col: 'col-sm-6' }, { k: 'tanggal_selesai', l: 'Selesai', type: 'date', req: true, col: 'col-sm-6' }] },
  Term: { id: 'term_id', title: 'Term', icon: 'date_range', cols: ['tahun_id', 'nomor', 'tanggal_mulai', 'tanggal_selesai'], fields: [{ k: 'tahun_id', l: 'Tahun Ajaran', type: 'select', req: true, opts: () => S.master.tahun.map((t) => ({ v: t.tahun_id, l: t.label })) }, { k: 'nomor', l: 'Nomor Term', type: 'number', req: true, min: 1, max: 6, col: 'col-sm-4' }, { k: 'tanggal_mulai', l: 'Mulai', type: 'date', req: true, col: 'col-sm-4' }, { k: 'tanggal_selesai', l: 'Selesai', type: 'date', req: true, col: 'col-sm-4' }] },
  Kelas: { id: 'kelas_id', title: 'Kelas / Rombel', icon: 'meeting_room', cols: ['unit_id', 'nama_kelas', 'tingkat', 'aktif'], fields: [{ k: 'unit_id', l: 'Unit', type: 'select', req: true, opts: () => S.master.unit.map((u) => ({ v: u.unit_id, l: u.unit_id + ' — ' + u.nama_lengkap })), col: 'col-sm-6' }, { k: 'nama_kelas', l: 'Nama Kelas', req: true, ph: 'X-MIPA 1', col: 'col-sm-6' }, { k: 'tingkat', l: 'Tingkat', col: 'col-sm-6' }, { k: 'aktif', l: 'Aktif', type: 'bool', def: true, col: 'col-sm-6' }] },
  JamPelajaran: { id: 'jam_id', title: 'Jam Pelajaran', icon: 'schedule', cols: ['unit_id', 'urutan', 'mulai', 'selesai'], fields: [{ k: 'unit_id', l: 'Unit', type: 'select', req: true, opts: () => S.master.unit.map((u) => ({ v: u.unit_id, l: u.unit_id })), col: 'col-sm-6' }, { k: 'urutan', l: 'Jam ke-', type: 'number', req: true, min: 1, col: 'col-sm-6' }, { k: 'mulai', l: 'Mulai', type: 'time', req: true, col: 'col-sm-6' }, { k: 'selesai', l: 'Selesai', type: 'time', req: true, col: 'col-sm-6' }] },
  HariLibur: { id: 'libur_id', title: 'Hari Libur', icon: 'beach_access', cols: ['tanggal', 'keterangan', 'unit_id'], fields: [{ k: 'tanggal', l: 'Tanggal', type: 'date', req: true, col: 'col-sm-6' }, { k: 'unit_id', l: 'Unit (kosong = semua)', type: 'select', ph: 'Semua unit', opts: () => S.master.unit.map((u) => ({ v: u.unit_id, l: u.unit_id })), col: 'col-sm-6' }, { k: 'keterangan', l: 'Keterangan', req: true }] },
  JenisPegawai: { id: 'jenis_id', title: 'Jenis Pegawai', icon: 'work', cols: ['nama', 'aktif'], fields: [{ k: 'nama', l: 'Nama Jenis', req: true, ph: 'mis. Staf Perpustakaan' }, { k: 'aktif', l: 'Aktif', type: 'bool', def: true }] }
};
const MASTER_KEY = { Unit: 'unit', TahunAjaran: 'tahun', Term: 'term', Kelas: 'kelas', JamPelajaran: 'jam', HariLibur: 'libur', JenisPegawai: 'jenis' };
const PERM_LABEL = { lihat_kehadiran: 'Lihat kehadiran', input_absen: 'Input absen', input_sakit_sendiri: 'Lapor sakit sendiri', kelola_cover: 'Kelola cover', ubah_alfa: 'Ubah alfa', kelola_jadwal_term: 'Jadwal term', kelola_jadwal_piket: 'Jadwal piket', kelola_pengguna: 'Kelola pengguna', lihat_rekap: 'Lihat rekap' };

function renderAdmin() {
  const A = S.ui.adm;
  const tabs = [['pengguna', 'group', '1. Pengguna'], ['peran', 'admin_panel_settings', '2. Peran & Hak Akses'], ['master', 'domain', '3. Unit & Term'], ['pengaturan', 'tune', '4. Pengaturan Sekolah'], ['piket', 'event_available', '5. Jadwal Piket'], ['jmengajar', 'calendar_view_week', '6. Jadwal Mengajar']];
  const ta = S.idx.tahun[termAktif().tahun_id] || {};
  let body = '';
  if (A.tab === 'pengguna') body = adminPengguna();
  else if (A.tab === 'peran') body = adminPeran();
  else if (A.tab === 'master') body = adminMaster();
  else if (A.tab === 'pengaturan') body = adminPengaturan();
  else if (A.tab === 'jmengajar') body = adminJadwalMengajar();
  else body = adminPiket();
  $('#view-admin').innerHTML = `
    <div class="page-head"><div><div class="crumbs">Pengaturan Sistem <span class="msi sm">chevron_right</span> <b>Pengguna &amp; Peran</b></div><h1>Pengguna, Peran &amp; Pengaturan Sekolah</h1></div>
      <div class="card-la px-3 py-2 d-flex align-items-center gap-2"><span class="dot-c" style="background:var(--ok)"></span><div class="small-xs"><b class="text-strong">Tahun Ajaran ${esc(ta.label || '')}</b><br>Term ${esc(termAktif().nomor || '')} Aktif • Notifikasi ${S.app.notifAktif ? 'Aktif' : 'Nonaktif'}</div></div></div>
    <div class="tabs-la mb-4" role="tablist">${tabs.map(([k, i, l]) => `<button type="button" role="tab" aria-selected="${A.tab === k}" class="${A.tab === k ? 'active' : ''}" onclick="App.admTab('${k}')">${ico(i)} ${esc(l)}</button>`).join('')}</div>
    ${body}`;
}

function adminPengguna() {
  const A = S.ui.adm, q = A.q.toLowerCase();
  const peranNm = (id) => (S.admin.peran.find((p) => p.peran_id === id) || {}).nama_peran || '—';
  const list = S.admin.pengguna.filter((u) => (!q || String(u.nama).toLowerCase().includes(q) || String(u.email).toLowerCase().includes(q)) && (!A.unit || u.unit_id === A.unit) && (!A.peran || u.peran_id === A.peran))
    .sort((a, b) => String(a.nama).localeCompare(b.nama));
  return `<div class="card-la">
    <div class="card-pad pb-3 d-flex flex-wrap gap-2 align-items-center">
      <div class="search-box" style="min-width:240px;flex:1">${ico('search')}<input class="input-la" placeholder="Cari nama atau email…" value="${esc(A.q)}" oninput="App.admQ(this.value)" aria-label="Cari pengguna"></div>
      <select class="select-la" style="width:auto" onchange="App.admSet('unit', this.value)" aria-label="Unit"><option value="">Semua Unit</option>${S.master.unit.map((u) => `<option ${A.unit === u.unit_id ? 'selected' : ''}>${u.unit_id}</option>`).join('')}</select>
      <select class="select-la" style="width:auto" onchange="App.admSet('peran', this.value)" aria-label="Peran"><option value="">Semua Peran</option>${S.admin.peran.map((p) => `<option value="${p.peran_id}" ${A.peran === p.peran_id ? 'selected' : ''}>${esc(p.nama_peran)}</option>`).join('')}</select>
      <button class="btn-la btn-soft" onclick="App.importExcel('PENGGUNA')">${ico('upload_file')} Impor Excel</button><button class="btn-la btn-primary-la" onclick="App.editUser()">${ico('person_add')} Tambah Pengguna</button>
    </div>
    <div class="table-wrap px-2 pb-2"><table class="table-la table-cards"><thead><tr><th>Pengguna</th><th>Email Login</th><th>Peran</th><th>Unit</th><th>Status</th><th class="text-end">Aksi</th></tr></thead><tbody>
      ${list.map((u) => `<tr><td class="td-main"><div class="person">${avatar(u.id_pengguna, u.nama)}<div><div class="nm">${esc(u.nama)}${pending(u)}</div><div class="sub">${esc(u.bidang_studi || '')} · ${esc((S.idx.jenis[u.jenis_id] || {}).nama || '')}</div></div></div></td>
        <td data-label="Email">${u.email ? esc(u.email) : '<span class="chip neutral">Tanpa akun login</span>'}</td>
        <td data-label="Peran"><span class="chip unit">${esc(peranNm(u.peran_id))}</span></td><td data-label="Unit">${esc(u.unit_id || 'Semua')}</td>
        <td data-label="Status">${isOn(u.aktif) ? '<span class="chip selesai">Aktif</span>' : '<span class="chip arsip">Nonaktif</span>'}</td>
        <td data-label="Aksi" class="text-end"><div class="d-inline-flex gap-1">${u.email && isOn(u.aktif) && u.id_pengguna !== S.admin.pengguna.find((x) => x.email === S.real.email)?.id_pengguna ? `<button class="icon-btn" onclick="App.simulasi('${u.id_pengguna}')" title="Lihat aplikasi sebagai pengguna ini" aria-label="Simulasi">${ico('visibility')}</button>` : ''}<button class="icon-btn" onclick="App.editUser('${u.id_pengguna}')" aria-label="Ubah">${ico('edit')}</button></div></td></tr>`).join('')}
    </tbody></table></div><div class="px-4 py-3 small-xs muted">${list.length} pengguna · Pegawai tanpa email tetap dapat dicatat absennya tetapi tidak dapat masuk aplikasi.</div></div>`;
}

function editUser(id) {
  const u = id ? S.admin.pengguna.find((x) => x.id_pengguna === id) : null;
  formModal({
    title: u ? 'Ubah Pengguna' : 'Tambah Pengguna', sub: u ? u.email : 'Daftarkan email Google sekolah', icon: 'person_add',
    fields: [
      { k: 'nama', l: 'Nama Lengkap', req: true, col: 'col-sm-6' },
      { k: 'email', l: 'Email Google Sekolah', type: 'email', ph: 'nama@sekolah.sch.id', col: 'col-sm-6', help: 'Kosongkan untuk pegawai tanpa akun (mis. keamanan).', valid: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), err: 'Format email tidak valid.' },
      { k: 'peran_id', l: 'Peran', type: 'select', req: true, opts: S.admin.peran.map((p) => ({ v: p.peran_id, l: p.nama_peran })), col: 'col-sm-6' },
      { k: 'unit_id', l: 'Unit', type: 'select', ph: 'Semua unit (Admin/Direktur)', opts: S.master.unit.map((x) => ({ v: x.unit_id, l: x.unit_id + ' — ' + x.nama_lengkap })), col: 'col-sm-6' },
      { k: 'jenis_id', l: 'Jenis Pegawai', type: 'select', opts: S.master.jenis.filter((j) => isOn(j.aktif)).map((j) => ({ v: j.jenis_id, l: j.nama })), col: 'col-sm-6' },
      { k: 'bidang_studi', l: 'Bidang Studi / Jabatan', col: 'col-sm-6' },
      { k: 'aktif', l: 'Aktif', type: 'bool', def: true, cap: 'Akun aktif' }
    ],
    values: u || { aktif: true },
    onSubmit: (v) => {
      const rec = Object.assign({}, u || {}, v, { aktif: v.aktif ? 'TRUE' : 'FALSE', _pending: true });
      if (!u) rec.id_pengguna = uid();
      const list = S.admin.pengguna;
      const before = u ? clone(u) : null;
      if (u) Object.assign(u, rec); else list.push(rec);
      reindex(); refreshView();
      toast('ok', u ? 'Pengguna diperbarui' : 'Pengguna ditambahkan', v.nama);
      run('savePengguna', Object.assign({}, v, { id_pengguna: u ? u.id_pengguna : '' })).then((r) => {
        const tgt = u || rec; Object.keys(tgt).forEach((k) => delete tgt[k]); Object.assign(tgt, r.pengguna); reindex(); syncSoon();
        refreshView();
      }).catch((err) => {
        if (u) { Object.keys(u).forEach((k) => delete u[k]); Object.assign(u, before); } else S.admin.pengguna = list.filter((x) => x !== rec);
        reindex(); refreshView(); toast('err', 'Gagal menyimpan pengguna', err.message);
      });
    }
  });
}

function adminPeran() {
  const keys = Object.keys(PERM_LABEL);
  return `<div class="card-la"><div class="card-pad pb-3 d-flex flex-wrap justify-content-between gap-2 align-items-center"><div><h2>Peran &amp; Hak Akses</h2><p class="muted small-xs mb-0">Centang untuk mengubah izin — tersimpan otomatis. Peran disimpan sebagai data, jadi peran baru langsung berlaku tanpa mengubah kode.</p></div><button class="btn-la btn-primary-la" onclick="App.addPeran()">${ico('add')} Tambah Peran</button></div>
    <div class="table-wrap px-2 pb-2"><table class="table-la perm-table"><thead><tr><th>Peran</th><th>Cakupan</th>${keys.map((k) => `<th style="white-space:normal;min-width:84px">${esc(PERM_LABEL[k])}</th>`).join('')}<th></th></tr></thead><tbody>
      ${S.admin.peran.map((p) => `<tr><td><b class="text-strong">${esc(p.nama_peran)}</b>${pending(p)}<div class="small-xs muted">${esc(p.kode)}${isOn(p.bawaan) ? ' · bawaan' : ''}</div></td>
        <td><select class="select-la" style="min-width:110px" onchange="App.permSet('${p.peran_id}','cakupan',this.value)" aria-label="Cakupan ${esc(p.nama_peran)}">${['SEMUA', 'UNIT', 'DIRI'].map((c) => `<option ${p.cakupan === c ? 'selected' : ''} value="${c}">${c === 'SEMUA' ? 'Semua unit' : c === 'UNIT' ? 'Unit sendiri' : 'Diri sendiri'}</option>`).join('')}</select></td>
        ${keys.map((k) => `<td><input type="checkbox" ${isOn(p[k]) ? 'checked' : ''} ${p.kode === 'ADMIN' && k === 'kelola_pengguna' ? 'disabled' : ''} onchange="App.permSet('${p.peran_id}','${k}',this.checked)" aria-label="${esc(PERM_LABEL[k])} untuk ${esc(p.nama_peran)}"></td>`).join('')}
        <td>${!isOn(p.bawaan) ? `<button class="icon-btn" onclick="App.delPeran('${p.peran_id}')" aria-label="Hapus peran">${ico('delete')}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="px-4 py-3"><div class="info-box">${ico('info')}<div><b>Kepala Sekolah</b> otomatis tampil sebagai “<i>[Unit] Principal</i>”. <b>Guru Piket</b> bukan peran terpisah: guru otomatis mendapat menu Tugas Piket Saya saat tercantum di Jadwal Piket.</div></div></div></div>`;
}
function permSet(id, k, v) {
  const p = S.admin.peran.find((x) => x.peran_id === id); if (!p) return;
  const before = clone(p);
  p[k] = k === 'cakupan' ? v : (v ? 'TRUE' : 'FALSE'); p._pending = true; renderAdmin();
  const payload = { peran_id: id, nama_peran: p.nama_peran, cakupan: p.cakupan };
  Object.keys(PERM_LABEL).forEach((x) => { payload[x] = isOn(p[x]); });
  run('savePeran', payload).then((r) => { Object.assign(p, r.peran); delete p._pending; renderAdmin(); syncSoon(); })
    .catch((e) => { Object.keys(p).forEach((x) => delete p[x]); Object.assign(p, before); renderAdmin(); toast('err', 'Gagal menyimpan izin', e.message); });
}
function addPeran() {
  formModal({
    title: 'Tambah Peran', sub: 'mis. Staf Perpustakaan, Petugas Keamanan', icon: 'add_moderator', size: 'md',
    fields: [{ k: 'nama_peran', l: 'Nama Peran', req: true }, { k: 'kode', l: 'Kode (opsional)', ph: 'PERPUS' }, { k: 'cakupan', l: 'Cakupan Data', type: 'select', ph: false, opts: [{ v: 'DIRI', l: 'Diri sendiri' }, { v: 'UNIT', l: 'Unit sendiri' }, { v: 'SEMUA', l: 'Semua unit' }] }],
    extra: `<div class="row g-2 mt-2">${Object.keys(PERM_LABEL).map((k) => `<div class="col-6"><label class="check-la"><input type="checkbox" class="np-perm" value="${k}" ${k === 'input_sakit_sendiri' || k === 'lihat_rekap' ? 'checked' : ''}><span>${esc(PERM_LABEL[k])}</span></label></div>`).join('')}</div>`,
    onSubmit: (v) => {
      const rec = { nama_peran: v.nama_peran, kode: v.kode, cakupan: v.cakupan };
      $$('.np-perm').forEach((c) => { rec[c.value] = c.checked; });
      const tmp = Object.assign({ peran_id: uid(), bawaan: 'FALSE', _pending: true }, rec);
      Object.keys(PERM_LABEL).forEach((k) => { tmp[k] = rec[k] ? 'TRUE' : 'FALSE'; });
      S.admin.peran.push(tmp); renderAdmin();
      run('savePeran', rec).then((r) => { Object.keys(tmp).forEach((k) => delete tmp[k]); Object.assign(tmp, r.peran); S.master.peran.push({ peran_id: tmp.peran_id, kode: tmp.kode, nama_peran: tmp.nama_peran }); reindex(); renderAdmin(); toast('ok', 'Peran ditambahkan', tmp.nama_peran); })
        .catch((e) => { S.admin.peran = S.admin.peran.filter((x) => x !== tmp); renderAdmin(); toast('err', 'Gagal', e.message); });
    }
  });
}
async function delPeran(id) {
  const p = S.admin.peran.find((x) => x.peran_id === id);
  if (!p || !(await confirmDlg({ title: 'Hapus peran?', msg: `Peran "${p.nama_peran}" akan dihapus. Hanya bisa bila tidak dipakai pengguna.`, danger: true, ok: 'Hapus' }))) return;
  const idx = S.admin.peran.indexOf(p); S.admin.peran.splice(idx, 1); renderAdmin();
  run('hapusPeran', id).then(() => toast('ok', 'Peran dihapus')).catch((e) => { S.admin.peran.splice(idx, 0, p); renderAdmin(); toast('err', 'Tidak dapat dihapus', e.message); });
}

function adminMaster() {
  const card = (sheet) => {
    const cfg = MASTER_CFG[sheet];
    let rows = S.master[MASTER_KEY[sheet]].slice();
    if (sheet === 'JamPelajaran' || sheet === 'Kelas') rows.sort((a, b) => a.unit_id.localeCompare(b.unit_id) || Number(a.urutan || 0) - Number(b.urutan || 0) || String(a.nama_kelas || '').localeCompare(b.nama_kelas || ''));
    if (sheet === 'Term') rows.sort((a, b) => a.tanggal_mulai.localeCompare(b.tanggal_mulai));
    if (sheet === 'HariLibur') rows.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    const lbl = { unit_id: 'Unit', nama_lengkap: 'Nama', setara: 'Setara', aktif: 'Status', label: 'Label', tanggal_mulai: 'Mulai', tanggal_selesai: 'Selesai', tahun_id: 'T.A.', nomor: 'Term', nama_kelas: 'Kelas', tingkat: 'Tingkat', urutan: 'Jam', mulai: 'Mulai', selesai: 'Selesai', tanggal: 'Tanggal', keterangan: 'Keterangan', nama: 'Nama' };
    const show = (r, c) => c === 'aktif' ? (isOn(r[c]) ? '<span class="chip selesai">Aktif</span>' : '<span class="chip arsip">Nonaktif</span>') : c === 'tahun_id' ? esc((S.idx.tahun[r[c]] || {}).label || r[c]) : /tanggal/.test(c) ? esc(fmtD(r[c])) : c === 'unit_id' && !r[c] ? 'Semua' : esc(r[c]);
    return `<div class="col-xl-6"><div class="card-la h-100"><div class="card-pad pb-2 d-flex justify-content-between align-items-center"><h3>${ico(cfg.icon)} ${esc(cfg.title)} <span class="chip neutral">${rows.length}</span></h3><button class="btn-la btn-soft btn-sm-la" onclick="App.editMaster('${sheet}')">${ico('add', 'sm')} Tambah</button></div>
      <div class="table-wrap px-2 pb-2" style="max-height:340px;overflow:auto"><table class="table-la"><thead><tr>${cfg.cols.map((c) => `<th>${lbl[c] || c}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr>${cfg.cols.map((c) => `<td>${show(r, c)}</td>`).join('')}<td class="text-end" style="white-space:nowrap">${pending(r)}<button class="icon-btn" onclick="App.editMaster('${sheet}','${esc(r[cfg.id])}')" aria-label="Ubah">${ico('edit')}</button><button class="icon-btn" onclick="App.delMaster('${sheet}','${esc(r[cfg.id])}')" aria-label="Hapus">${ico('delete')}</button></td></tr>`).join('') || `<tr><td colspan="9">${emptyState('inbox', 'Belum ada data', '')}</td></tr>`}
      </tbody></table></div></div></div>`;
  };
  return `<div class="d-flex justify-content-end mb-2"><button class="btn-la btn-soft" onclick="App.importExcel('KELAS')">${ico('upload_file')} Impor Excel (Kelas, Jam, Hari Libur)</button></div>
    <div class="info-box mb-3">${ico('info')}<div>Data master dipakai di seluruh aplikasi. Data yang sudah dipakai tidak dapat dihapus — nonaktifkan saja. Tahun ajaran &amp; term aktif diatur di tab Pengaturan Sekolah.</div></div>
    <div class="row g-3">${['Unit', 'TahunAjaran', 'Term', 'HariLibur', 'Kelas', 'JamPelajaran', 'JenisPegawai'].map(card).join('')}</div>`;
}
function editMaster(sheet, id) {
  const cfg = MASTER_CFG[sheet], list = S.master[MASTER_KEY[sheet]];
  const row = id ? list.find((r) => r[cfg.id] === id) : null;
  formModal({
    title: (row ? 'Ubah ' : 'Tambah ') + cfg.title, icon: cfg.icon, size: 'md',
    fields: cfg.fields.map((f) => Object.assign({}, f, { opts: typeof f.opts === 'function' ? f.opts() : f.opts, readonly: row && f.lockEdit })),
    values: row || {},
    onSubmit: (v) => {
      Object.keys(v).forEach((k) => { if (typeof v[k] === 'boolean') v[k] = v[k] ? 'TRUE' : 'FALSE'; });
      if (v.tanggal_mulai && v.tanggal_selesai && v.tanggal_selesai < v.tanggal_mulai) { toast('warn', 'Tanggal tidak valid', 'Tanggal selesai lebih awal dari mulai.'); return false; }
      const payload = Object.assign({}, row || {}, v); delete payload._pending;
      if (row) payload.__edit = true;
      const before = row ? clone(row) : null;
      const tmp = row || Object.assign({}, v, { [cfg.id]: v[cfg.id] || uid() });
      Object.assign(tmp, v, { _pending: true }); if (!row) list.push(tmp);
      reindex(); renderAdmin();
      run('saveMaster', sheet, payload).then((r) => { Object.keys(tmp).forEach((k) => delete tmp[k]); Object.assign(tmp, r.row); reindex(); renderAdmin(); toast('ok', cfg.title + ' tersimpan'); })
        .catch((e) => { if (row) { Object.keys(row).forEach((k) => delete row[k]); Object.assign(row, before); } else list.splice(list.indexOf(tmp), 1); reindex(); renderAdmin(); toast('err', 'Gagal menyimpan', e.message); });
    }
  });
}
async function delMaster(sheet, id) {
  const cfg = MASTER_CFG[sheet], list = S.master[MASTER_KEY[sheet]];
  const row = list.find((r) => r[cfg.id] === id); if (!row) return;
  if (!(await confirmDlg({ title: 'Hapus data?', msg: `Data ${cfg.title} akan dihapus permanen bila belum dipakai.`, danger: true, ok: 'Hapus' }))) return;
  const i = list.indexOf(row); list.splice(i, 1); reindex(); renderAdmin();
  run('hapusMaster', sheet, id).then(() => toast('ok', 'Data dihapus')).catch((e) => { list.splice(i, 0, row); reindex(); renderAdmin(); toast('err', 'Tidak dapat dihapus', e.message); });
}

// ════════════════════════════════════════════════════════════════════════════
// IMPOR EXCEL / CSV (Pengguna, Kelas, Jam Pelajaran, Hari Libur)
// Berkas dibaca di peramban (SheetJS, dimuat saat dibutuhkan) → pratinjau + validasi → server menulis batch.
// ════════════════════════════════════════════════════════════════════════════
const IMP = {
  PENGGUNA: {
    title: 'Pengguna', sheet: 'Pengguna', icon: 'group',
    cols: [['email', 'Email'], ['nama', 'Nama'], ['jenis', 'Jenis Pegawai'], ['peran', 'Peran'], ['unit', 'Unit'], ['bidang_studi', 'Bidang Studi'], ['aktif', 'Aktif']],
    alias: { email: ['email', 'emaillogin', 'emailgmail', 'alamatemail', 'gmail'], nama: ['nama', 'namalengkap', 'namapegawai', 'namaguru'], jenis: ['jenispegawai', 'jenis', 'statuspegawai'], peran: ['peran', 'role', 'hakakses'], unit: ['unit', 'kodeunit', 'unitid', 'jenjang'], bidang_studi: ['bidangstudi', 'mapel', 'matapelajaran', 'bidang'], aktif: ['aktif', 'status'] },
    req: ['email', 'nama'], hint: 'Kolom wajib: Email, Nama (Peran wajib untuk pengguna baru). Email yang sudah terdaftar akan diperbarui.'
  },
  KELAS: {
    title: 'Kelas', sheet: 'Kelas', icon: 'meeting_room',
    cols: [['unit', 'Unit'], ['nama_kelas', 'Nama Kelas'], ['tingkat', 'Tingkat'], ['aktif', 'Aktif']],
    alias: { unit: ['unit', 'kodeunit', 'unitid', 'jenjang'], nama_kelas: ['namakelas', 'kelas', 'rombel'], tingkat: ['tingkat', 'grade', 'level'], aktif: ['aktif', 'status'] },
    req: ['unit', 'nama_kelas'], hint: 'Kolom wajib: Unit, Nama Kelas. Kelas yang sama (unit + nama) akan diperbarui.'
  },
  JAM: {
    title: 'Jam Pelajaran', sheet: 'JamPelajaran', icon: 'schedule',
    cols: [['unit', 'Unit'], ['urutan', 'Jam Ke'], ['mulai', 'Mulai'], ['selesai', 'Selesai']],
    alias: { unit: ['unit', 'kodeunit', 'unitid', 'jenjang'], urutan: ['jamke', 'jamkeke', 'urutan', 'jam', 'no'], mulai: ['mulai', 'jammulai', 'awal', 'dari'], selesai: ['selesai', 'jamselesai', 'akhir', 'sampai', 'hingga'] },
    req: ['unit', 'urutan', 'mulai', 'selesai'], hint: 'Kolom wajib: Unit, Jam Ke, Mulai, Selesai (format 07:30). Jam ke- yang sama akan diperbarui.'
  },
  LIBUR: {
    title: 'Hari Libur', sheet: 'HariLibur', icon: 'event_busy',
    cols: [['tanggal', 'Tanggal'], ['keterangan', 'Keterangan'], ['unit', 'Unit']],
    alias: { tanggal: ['tanggal', 'tgl', 'date'], keterangan: ['keterangan', 'namalibur', 'libur', 'deskripsi', 'ket', 'nama'], unit: ['unit', 'kodeunit', 'unitid'] },
    req: ['tanggal', 'keterangan'], hint: 'Kolom wajib: Tanggal (yyyy-mm-dd atau dd/mm/yyyy), Keterangan. Kosongkan Unit untuk semua unit.'
  }
};
const IMP_MAX = 1000;
const normH = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '');
const p2 = (n) => String(n).padStart(2, '0');

let xlsxReady = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxReady) return xlsxReady;
  const src = 'https:' + String.fromCharCode(47, 47) + 'cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  xlsxReady = new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = window.LA_XLSX_SRC || src;
    sc.onload = () => (window.XLSX ? resolve(window.XLSX) : (xlsxReady = null, reject(new Error('Pustaka Excel tidak lengkap.'))));
    sc.onerror = () => { xlsxReady = null; reject(new Error('Pustaka Excel gagal dimuat. Periksa koneksi internet lalu coba lagi.')); };
    document.head.appendChild(sc);
  });
  return xlsxReady;
}

/** Nilai sel → teks rapi. */
function cellTxt(v) { return v == null ? '' : (typeof v === 'number' ? String(v) : String(v).replace(/\s+/g, ' ').trim()); }
function toYmd(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; }
  const t = cellTxt(v); let m;
  if ((m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  if ((m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/))) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
  return t;
}
function toHm(v) {
  if (typeof v === 'number' && v >= 0 && v < 1) { const mnt = Math.round(v * 1440); return `${p2(Math.floor(mnt / 60) % 24)}:${p2(mnt % 60)}`; }
  const t = cellTxt(v); const m = t.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  return m ? `${p2(m[1])}:${p2(m[2])}` : t;
}
const offVal = (v) => ['false', 'tidak', 'nonaktif', 'non-aktif', '0', 'no', 'n'].includes(String(v).trim().toLowerCase());

/** Baca berkas → { rows:[{_baris, ...field}], sheetName }. Lempar Error berpesan jelas bila format salah. */
async function impRead(file, tipe) {
  const X = await loadXlsx();
  const wb = X.read(await file.arrayBuffer(), { type: 'array' });
  const cfg = IMP[tipe];
  const name = wb.SheetNames.find((n) => normH(n) === normH(cfg.sheet)) || wb.SheetNames[0];
  const aoa = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: true });
  let hi = -1, map = {};
  for (let i = 0; i < Math.min(aoa.length, 15) && hi < 0; i++) {
    const m = {};
    aoa[i].forEach((h, ci) => { const n = normH(h); Object.keys(cfg.alias).forEach((f) => { if (!(f in m) && cfg.alias[f].includes(n)) m[f] = ci; }); });
    if (cfg.req.every((f) => f in m)) { hi = i; map = m; }
  }
  if (hi < 0) {
    const need = cfg.req.map((f) => (cfg.cols.find((c) => c[0] === f) || [f, f])[1]).join(', ');
    throw new Error(`Kolom wajib tidak ditemukan di sheet "${name}". Pastikan baris judul memuat: ${need}. Gunakan template agar aman.`);
  }
  const rows = [];
  for (let i = hi + 1; i < aoa.length; i++) {
    const line = aoa[i];
    if (line.every((c) => cellTxt(c) === '')) continue;
    const r = { _baris: i + 1 };
    Object.keys(map).forEach((f) => {
      const raw = line[map[f]];
      r[f] = f === 'tanggal' ? toYmd(raw) : (f === 'mulai' || f === 'selesai') ? toHm(raw) : f === 'aktif' ? (cellTxt(raw) === '' ? '' : (offVal(cellTxt(raw)) ? 'FALSE' : 'TRUE')) : f === 'urutan' ? cellTxt(raw).replace(/\.0+$/, '') : cellTxt(raw);
    });
    rows.push(r);
  }
  if (!rows.length) throw new Error(`Sheet "${name}" tidak berisi data di bawah baris judul.`);
  if (rows.length > IMP_MAX) throw new Error(`Berkas berisi ${rows.length} baris. Maksimal ${IMP_MAX} baris per impor; pecah menjadi beberapa berkas.`);
  return { rows, sheetName: name };
}

/** Pratinjau: cerminan aturan server (server tetap memvalidasi ulang). → [{r, st:'baru'|'ubah'|'galat', msg}] */
function impCheck(tipe, rows) {
  const lw = (v) => String(v == null ? '' : v).trim().toLowerCase();
  const unitMap = {};
  S.master.unit.forEach((u) => { unitMap[lw(u.unit_id)] = u.unit_id; unitMap[lw(u.nama_lengkap)] = u.unit_id; });
  const unitOf = (v) => { v = lw(v); if (!v || v === 'semua' || v === 'all') return ''; return unitMap[v] === undefined ? null : unitMap[v]; };
  const seen = {}, out = [];
  const realDate = (d) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false; const t = new Date(d + 'T00:00:00Z'); return !isNaN(t) && t.toISOString().slice(0, 10) === d; };
  const dom = String((S.admin.pengaturan || {}).domain_email || '').trim().toLowerCase().replace(/^@/, '');
  if (tipe === 'PENGGUNA') {
    const byEmail = {}; S.admin.pengguna.forEach((u) => { byEmail[lw(u.email)] = u; });
    const peranOf = (v) => S.admin.peran.find((p) => lw(p.nama_peran) === lw(v) || lw(p.kode) === lw(v));
    const jenisOf = (v) => Object.values(S.idx.jenis).find((j) => lw(j.nama) === lw(v) || lw(j.jenis_id) === lw(v));
    rows.forEach((r) => {
      const email = lw(r.email); let msg = '';
      const ex = byEmail[email];
      const pr = r.peran ? peranOf(r.peran) : (ex ? S.admin.peran.find((p) => p.peran_id === ex.peran_id) : null);
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) msg = 'Email tidak valid.';
      else if (!r.nama) msg = 'Nama wajib diisi.';
      else if (dom && !email.endsWith('@' + dom)) msg = 'Email harus berdomain ' + dom + '.';
      else if (seen[email]) msg = 'Email ganda di dalam berkas.';
      else if (email === lw(S.real.email)) msg = 'Akun Anda sendiri tidak diubah lewat impor.';
      else if (!pr) msg = r.peran ? `Peran "${r.peran}" tidak dikenal.` : 'Peran wajib diisi.';
      else if (r.jenis && !jenisOf(r.jenis)) msg = `Jenis pegawai "${r.jenis}" tidak dikenal.`;
      else if (r.unit && unitOf(r.unit) === null) msg = `Unit "${r.unit}" tidak dikenal.`;
      else if (!(r.unit ? unitOf(r.unit) : (ex ? ex.unit_id : '')) && pr.cakupan === 'UNIT') msg = `Peran "${pr.nama_peran}" wajib mengisi Unit.`;
      seen[email] = 1;
      out.push({ r, st: msg ? 'galat' : ex ? 'ubah' : 'baru', msg });
    });
  } else if (tipe === 'KELAS') {
    const ex = {}; S.master.kelas.forEach((k) => { ex[k.unit_id + '|' + lw(k.nama_kelas)] = 1; });
    rows.forEach((r) => {
      const u = unitOf(r.unit); let msg = '';
      const key = u + '|' + lw(r.nama_kelas);
      if (!u) msg = r.unit ? `Unit "${r.unit}" tidak dikenal.` : 'Unit wajib diisi.';
      else if (!r.nama_kelas) msg = 'Nama kelas wajib diisi.';
      else if (seen[key]) msg = 'Kelas ganda di dalam berkas.';
      seen[key] = 1;
      out.push({ r, st: msg ? 'galat' : ex[key] ? 'ubah' : 'baru', msg });
    });
  } else if (tipe === 'JAM') {
    const ex = {}; S.master.jam.forEach((j) => { ex[j.unit_id + '|' + Number(j.urutan)] = 1; });
    rows.forEach((r) => {
      const u = unitOf(r.unit), n = Number(r.urutan); let msg = '';
      const key = u + '|' + n;
      if (!u) msg = r.unit ? `Unit "${r.unit}" tidak dikenal.` : 'Unit wajib diisi.';
      else if (!(n >= 1 && n <= 30) || Math.floor(n) !== n) msg = 'Jam ke- harus bilangan bulat 1-30.';
      else if (!/^\d{2}:\d{2}$/.test(r.mulai) || !/^\d{2}:\d{2}$/.test(r.selesai)) msg = 'Jam harus berformat HH:mm (mis. 07:30).';
      else if (r.selesai <= r.mulai) msg = 'Jam selesai harus setelah jam mulai.';
      else if (seen[key]) msg = `Jam ke-${n} ganda untuk unit ${u}.`;
      seen[key] = 1;
      out.push({ r, st: msg ? 'galat' : ex[key] ? 'ubah' : 'baru', msg });
    });
  } else {
    const ex = {}; S.master.libur.forEach((l) => { ex[l.tanggal + '|' + l.unit_id] = 1; });
    rows.forEach((r) => {
      const u = unitOf(r.unit); let msg = '';
      const key = r.tanggal + '|' + u;
      if (!realDate(r.tanggal)) msg = 'Tanggal harus yyyy-mm-dd atau dd/mm/yyyy dan benar-benar ada.';
      else if (!r.keterangan) msg = 'Keterangan wajib diisi.';
      else if (u === null) msg = `Unit "${r.unit}" tidak dikenal.`;
      else if (seen[key]) msg = 'Tanggal libur ganda di dalam berkas.';
      seen[key] = 1;
      out.push({ r, st: msg ? 'galat' : ex[key] ? 'ubah' : 'baru', msg });
    });
  }
  return out;
}

/** Unduh template .xlsx (4 sheet data + sheet Petunjuk berisi nilai yang valid). */
async function impTemplate() {
  try {
    const X = await loadXlsx();
    const wb = X.utils.book_new();
    Object.keys(IMP).forEach((k) => {
      const cfg = IMP[k];
      const ws = X.utils.aoa_to_sheet([cfg.cols.map((c) => c[1])]);
      ws['!cols'] = cfg.cols.map((c) => ({ wch: Math.max(16, c[1].length + 6) }));
      X.utils.book_append_sheet(wb, ws, cfg.sheet);
    });
    const peran = S.admin.peran.map((p) => p.nama_peran).join(', ');
    const jenis = Object.values(S.idx.jenis).map((j) => j.nama).join(', ');
    const unit = S.master.unit.map((u) => u.unit_id).join(', ');
    const pet = [
      ['PETUNJUK IMPOR - LEARNING ACTIVITY'], [''],
      ['1. Isi data di sheet yang sesuai (Pengguna / Kelas / JamPelajaran / HariLibur). Baris judul (baris 1) jangan diubah.'],
      ['2. Satu berkas diimpor untuk satu jenis data per kali. Pilih jenis data yang sama di layar Impor.'],
      ['3. Impor menambah data baru dan memperbarui data yang sama. Impor TIDAK menghapus data.'],
      ['4. Baris yang bermasalah dilewati dan dijelaskan alasannya di layar pratinjau.'], [''],
      ['NILAI YANG VALID'],
      ['Unit', unit], ['Peran', peran], ['Jenis Pegawai', jenis], ['Aktif', 'Ya / Tidak (kosong = Ya)'],
      ['Tanggal', 'yyyy-mm-dd atau dd/mm/yyyy (mis. 2026-12-25 atau 25/12/2026)'], ['Jam', 'HH:mm (mis. 07:30)'], [''],
      ['CONTOH BARIS'],
      ['Pengguna', 'budi@gmail.com | Budi Santoso | Guru | Guru | HS | Matematika | Ya'],
      ['Kelas', 'HS | 10 IPA 1 | 10 | Ya'],
      ['JamPelajaran', 'HS | 1 | 07:30 | 08:15'],
      ['HariLibur', '2026-12-25 | Hari Natal | (kosong = semua unit)']
    ];
    const wp = X.utils.aoa_to_sheet(pet); wp['!cols'] = [{ wch: 22 }, { wch: 90 }];
    X.utils.book_append_sheet(wb, wp, 'Petunjuk');
    const buf = X.write(wb, { type: 'array', bookType: 'xlsx' });
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Template_Impor_Learning_Activity.xlsx');
    toast('ok', 'Template diunduh', 'Isi sheet yang sesuai, lalu unggah kembali.');
  } catch (e) { toast('err', 'Gagal membuat template', e.message); }
}

function importExcel(tipe0) {
  const st = { tipe: IMP[tipe0] ? tipe0 : 'PENGGUNA', chk: null, busy: false };
  const cfgOf = () => IMP[st.tipe];
  const sum = () => { const n = (k) => (st.chk || []).filter((x) => x.st === k).length; return { baru: n('baru'), ubah: n('ubah'), galat: n('galat') }; };
  const refreshGo = () => {
    const b = $('#impGo'); if (!b) return;
    const s = sum(); const ok = s.baru + s.ubah;
    b.disabled = !ok || st.busy;
    b.innerHTML = `${ico('upload')} Impor ${ok} baris`;
  };
  const renderPreview = () => {
    const box = $('#impPreview'); if (!box) return;
    if (!st.chk) { box.innerHTML = ''; refreshGo(); return; }
    const cfg = cfgOf(), s = sum();
    const cols = cfg.cols.map((c) => c[0]);
    const lblSt = { baru: '<span class="chip selesai">Baru</span>', ubah: '<span class="chip izin">Diperbarui</span>', galat: '<span class="chip sakit">Dilewati</span>' };
    const rows = st.chk.slice(0, 300);
    box.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-2"><span class="chip selesai">${s.baru} baru</span><span class="chip izin">${s.ubah} diperbarui</span><span class="chip ${s.galat ? 'sakit' : 'neutral'}">${s.galat} dilewati</span><span class="small-xs muted ms-auto align-self-center">${st.chk.length} baris terbaca${st.chk.length > rows.length ? ` · menampilkan ${rows.length} pertama` : ''}</span></div>
      <div class="table-wrap" style="max-height:320px;overflow:auto"><table class="table-la"><thead><tr><th>Baris</th><th>Status</th>${cfg.cols.map((c) => `<th>${esc(c[1])}</th>`).join('')}<th>Catatan</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td>${x.r._baris}</td><td>${lblSt[x.st]}</td>${cols.map((c) => `<td>${esc(c === 'aktif' ? (x.r[c] === 'TRUE' ? 'Ya' : x.r[c] === 'FALSE' ? 'Tidak' : '') : (x.r[c] == null ? '' : x.r[c]))}</td>`).join('')}<td class="small-xs" style="color:var(--sick-fg)">${esc(x.msg)}</td></tr>`).join('')}
      </tbody></table></div>`;
    refreshGo();
  };
  const onFile = async (file) => {
    if (!file) return;
    const err = checkFile(file, 5, ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', '']);
    if (err) { toast('warn', 'Berkas belum valid', err); return; }
    const box = $('#impPreview'); box.innerHTML = `<div class="muted small-xs d-flex align-items-center gap-2"><span class="spin" style="width:14px;height:14px"></span> Membaca berkas…</div>`;
    try {
      const { rows, sheetName } = await impRead(file, st.tipe);
      st.chk = impCheck(st.tipe, rows);
      $('#impName').textContent = `${file.name} · sheet "${sheetName}"`;
      renderPreview();
    } catch (e) { st.chk = null; box.innerHTML = `<div class="info-box warn">${ico('error')}<div>${esc(e.message)}</div></div>`; refreshGo(); }
  };
  const doImport = async () => {
    const valid = st.chk.filter((x) => x.st !== 'galat').map((x) => x.r);
    if (!valid.length || st.busy) return;
    st.busy = true; $('#impGo').disabled = true; $('#impGo').innerHTML = `<span class="spin" style="width:14px;height:14px"></span> Mengimpor…`;
    try {
      const r = await run('importData', st.tipe, valid);
      const skip = (r.galat || []);
      $('#impPreview').innerHTML = `<div class="info-box">${ico('check_circle')}<div><b>Impor ${esc(cfgOf().title)} selesai.</b> ${r.baru} data baru, ${r.diperbarui} diperbarui${skip.length ? `, ${skip.length} dilewati oleh server` : ''}.</div></div>
        ${skip.length ? `<div class="small-xs mt-2">${skip.slice(0, 20).map((g) => `Baris ${esc(g.baris)}: ${esc(g.pesan)}`).join('<br>')}</div>` : ''}`;
      $('#impGo').style.display = 'none'; $('#impDrop').style.display = 'none';
      toast('ok', 'Impor selesai', `${r.baru} baru · ${r.diperbarui} diperbarui`);
      syncNow(false);
    } catch (e) { st.busy = false; refreshGo(); toast('err', 'Impor gagal', e.message); }
  };
  modal({
    title: 'Impor dari Excel', sub: 'Tambah & perbarui data secara massal (.xlsx, .xls, .csv)', icon: 'upload_file', size: 'xl',
    body: `<div class="row g-3 align-items-end mb-3">
        <div class="col-md-5"><label class="form-label-la" for="impTipe">Jenis data</label><select class="select-la" id="impTipe">${Object.keys(IMP).map((k) => `<option value="${k}" ${k === st.tipe ? 'selected' : ''}>${esc(IMP[k].title)}</option>`).join('')}</select></div>
        <div class="col-md-7 d-flex flex-wrap gap-2 justify-content-md-end"><button type="button" class="btn-la btn-soft" id="impTpl">${ico('download')} Unduh template</button></div>
      </div>
      <div class="info-box mb-3">${ico('info')}<div id="impHint"></div></div>
      <label class="dropzone mb-3" id="impDrop" style="width:100%;text-align:center"><input type="file" id="impFile" accept=".xlsx,.xls,.csv" aria-label="Unggah berkas Excel"><span class="dz-ico">${ico('upload_file')}</span><b class="text-strong d-block" id="impName">Pilih atau tarik berkas Excel / CSV</b><span class="small-xs muted d-block">Maks. 5 MB · ${IMP_MAX} baris</span></label>
      <div id="impPreview"></div>`,
    foot: `<button class="btn-la btn-ghost" type="button" data-bs-dismiss="modal">Tutup</button><button class="btn-la btn-primary-la" type="button" id="impGo" disabled>${ico('upload')} Impor 0 baris</button>`,
    onShow: () => {
      const hint = () => { $('#impHint').textContent = cfgOf().hint; };
      hint();
      $('#impTipe').onchange = (e) => { st.tipe = e.target.value; st.chk = null; $('#impFile').value = ''; $('#impName').textContent = 'Pilih atau tarik berkas Excel / CSV'; hint(); renderPreview(); };
      $('#impTpl').onclick = impTemplate;
      $('#impFile').onchange = (e) => onFile(e.target.files[0]);
      const dz = $('#impDrop');
      dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
      dz.ondragleave = () => dz.classList.remove('drag');
      dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); };
      $('#impGo').onclick = doImport;
      loadXlsx().catch(() => { /* ditangani saat berkas dipilih */ });
    }
  });
}

// ===========================================================================
// JADWAL MENGAJAR (impor dari jadwal pelajaran sekolah + tampilan + isi otomatis cover)
// ===========================================================================
const JM_HARI = { senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6, minggu: 7, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
const JM_MAX_ROWS = 4000;
const hariNo = (tgl) => { const d = dow(tgl); return d === 0 ? 7 : d; };

/** Pecah "Math (TP)" / "PDD (A/B/C)" / "PDD PA" menjadi { mapel, kodes[] }. */
function jmCell(txt) {
  const t = cellTxt(txt);
  const m = t.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!m) return { mapel: t, kodes: [] };
  const kodes = m[2].split(/[\/,;&+]/).map((x) => x.trim()).filter(Boolean);
  const mapel = m[1].trim();
  if (!mapel || !kodes.length) return { mapel: t, kodes: [] };
  return { mapel, kodes };
}

/** Baca berkas jadwal sekolah apa adanya. */
async function jmRead(file) {
  const X = await loadXlsx();
  const wb = X.read(await file.arrayBuffer(), { type: 'array' });
  const grid = (n) => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: true });
  let db = null;
  for (const name of wb.SheetNames) {
    const aoa = grid(name);
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      const col = {};
      aoa[i].forEach((h, ci) => {
        const n = normH(h);
        if (['kelas', 'rombel', 'namakelas'].includes(n) && !('kelas' in col)) col.kelas = ci;
        else if (n === 'hari' && !('hari' in col)) col.hari = ci;
        else if (['sesi', 'jenissesi', 'kegiatan'].includes(n) && !('sesi' in col)) col.sesi = ci;
        else if (['jamke', 'jam', 'urutan'].includes(n) && !('jamke' in col)) col.jamke = ci;
        else if (['waktumulai', 'mulai', 'jammulai'].includes(n) && !('mulai' in col)) col.mulai = ci;
        else if (['waktuselesai', 'selesai', 'jamselesai'].includes(n) && !('selesai' in col)) col.selesai = ci;
        else if (['tingkat', 'grade', 'level'].includes(n) && !('tingkat' in col)) col.tingkat = ci;
        else if ((n.includes('matapelajaran') || n.includes('mapel') || n.includes('subject')) && !('mapel' in col)) col.mapel = ci;
      });
      if (['kelas', 'hari', 'jamke', 'mapel'].every((k) => k in col)) { db = { name, aoa, hi: i, col }; break; }
    }
    if (db) break;
  }
  if (!db) throw new Error('Sheet jadwal tidak ditemukan. Berkas harus punya satu sheet dengan kolom Kelas, Hari, Jam Ke, dan Mata Pelajaran (& Kode Guru).');

  const rows = [], kelasMap = {}, jamVote = {};
  let skip = 0;
  for (let i = db.hi + 1; i < db.aoa.length; i++) {
    const line = db.aoa[i], c = db.col;
    if (line.every((x) => cellTxt(x) === '')) continue;
    const jm = cellTxt(line[c.jamke]).match(/^jam\s*(?:ke)?\s*-?\s*(\d{1,2})$/i) || cellTxt(line[c.jamke]).match(/^(\d{1,2})$/);
    const sesi = 'sesi' in c ? normH(line[c.sesi]) : 'kbm';
    if (!jm || (sesi && sesi !== 'kbm' && sesi !== 'belajar' && sesi !== 'pelajaran')) { skip++; continue; }   // istirahat, homeroom, dll
    const hari = JM_HARI[cellTxt(line[c.hari]).toLowerCase()];
    const kelas = cellTxt(line[c.kelas]);
    const cell = jmCell(line[c.mapel]);
    const urutan = Number(jm[1]);
    if (!hari || !kelas || !cell.mapel) { skip++; continue; }
    const tingkat = 'tingkat' in c ? (cellTxt(line[c.tingkat]).match(/(\d{1,2})/) || [])[1] || '' : '';
    if (!kelasMap[kelas]) kelasMap[kelas] = { nama: kelas, tingkat: tingkat || (kelas.match(/^(\d{1,2})/) || [])[1] || '' };
    if ('mulai' in c && 'selesai' in c) {
      const a = toHm(line[c.mulai]), b = toHm(line[c.selesai]);
      if (/^\d\d:\d\d$/.test(a) && /^\d\d:\d\d$/.test(b)) { const k = urutan + '|' + a + '|' + b; jamVote[k] = (jamVote[k] || 0) + 1; }
    }
    (cell.kodes.length ? cell.kodes : ['']).forEach((kode) => rows.push({ _baris: i + 1, hari, urutan, kelas, mapel: cell.mapel, kode, tim: cell.kodes.length }));
  }
  if (!rows.length) throw new Error('Tidak ada baris jam pelajaran (KBM) yang terbaca di sheet "' + db.name + '".');
  if (rows.length > JM_MAX_ROWS) throw new Error('Berkas menghasilkan ' + rows.length + ' baris. Maksimal ' + JM_MAX_ROWS + ' per impor.');

  // jam pelajaran: waktu yang paling sering muncul untuk tiap jam ke-
  const jam = {};
  Object.keys(jamVote).forEach((k) => { const [u, a, b] = k.split('|'); if (!jam[u] || jamVote[k] > jam[u].n) jam[u] = { urutan: Number(u), mulai: a, selesai: b, n: jamVote[k] }; });

  // daftar kode guru -> nama
  const codes = {};
  for (const name of wb.SheetNames) {
    if (name === db.name) continue;
    const aoa = grid(name);
    for (let i = 0; i < Math.min(aoa.length, 30); i++) {
      const hs = aoa[i].map(normH);
      const ik = hs.indexOf('kode'), iN = hs.findIndex((h) => h === 'namaguru' || h === 'nama');
      if (ik < 0 || iN < 0) continue;
      const im = hs.findIndex((h) => h.startsWith('matapelajaran') || h === 'mapel');
      for (let j = i + 1; j < aoa.length; j++) {
        const k = cellTxt(aoa[j][ik]); if (!k) break;
        codes[k] = { nama: cellTxt(aoa[j][iN]), mapel: im >= 0 ? cellTxt(aoa[j][im]) : '' };
      }
      break;
    }
  }
  // hitung pemakaian tiap kode
  const use = {};
  rows.forEach((r) => { if (r.kode) use[r.kode] = (use[r.kode] || 0) + 1; });
  const kodeList = Object.keys(use).sort((a, b) => a.localeCompare(b)).map((k) => ({ kode: k, nama: (codes[k] || {}).nama || '', mapel: (codes[k] || {}).mapel || '', n: use[k] }));
  return { rows, kodeList, kelas: Object.values(kelasMap).sort((a, b) => a.nama.localeCompare(b.nama, undefined, { numeric: true })), jam: Object.values(jam).sort((a, b) => a.urutan - b.urutan), sheetName: db.name, skip, tanpaKode: rows.filter((r) => !r.kode).length };
}

const jmNorm = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
/** Cocokkan nama guru di berkas dengan pengguna terdaftar (nama persis, atau satu nama memuat nama lain). */
function jmMatch(namaGuru, users) {
  const a = jmNorm(namaGuru); if (!a.length) return '';
  const sa = a.join(' ');
  let hit = users.find((u) => jmNorm(u.nama).join(' ') === sa);
  if (hit) return hit.id_pengguna;
  const cand = users.filter((u) => { const b = jmNorm(u.nama); const small = a.length <= b.length ? a : b, big = a.length <= b.length ? b : a; return small.length >= 2 && small.every((t) => big.includes(t)); });
  return cand.length === 1 ? cand[0].id_pengguna : '';
}

function jmUnits() {
  const all = S.idx.unitList;
  return S.units && S.units.length ? all.filter((u) => S.units.includes(u.unit_id)) : all;
}
function jmDefaults(J) {
  const us = jmUnits();
  if (!J.unit || !us.some((u) => u.unit_id === J.unit)) J.unit = (S.unit && S.unit !== 'ALL' && us.some((u) => u.unit_id === S.unit)) ? S.unit : ((us[0] || {}).unit_id || '');
  if (!J.term || !S.idx.term[J.term]) J.term = (termOf(S.today) || termAktif() || {}).term_id || ((S.master.term[0] || {}).term_id || '');
  return J;
}
const jmTermLabel = (t) => `Term ${t.nomor} - ${(S.idx.tahun[t.tahun_id] || {}).label || ''}`;
const jmRowsOf = (unit, term) => (S.data.jmengajar || []).filter((j) => j.unit_id === unit && j.term_id === term);
const jmWho = (j) => (j.pengguna_id ? nama(j.pengguna_id) : (j.kode_guru || '(tanpa kode)'));

function importJadwal() {
  const J = jmDefaults(S.ui.adm.jm);
  const st = { unit: J.unit, term: J.term, p: null, peta: {}, mkKelas: true, mkJam: true, busy: false };
  const usersAll = () => ((S.admin && S.admin.pengguna) || S.pegawai || []).filter((u) => isOn(u.aktif)).slice().sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
  const kn = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
  const missingKelas = () => st.p.kelas.filter((k) => !S.master.kelas.some((x) => x.unit_id === st.unit && kn(x.nama_kelas) === kn(k.nama)));
  const missingJam = () => st.p.jam.filter((j) => !(S.idx.jamByUnit[st.unit] || []).some((x) => Number(x.urutan) === j.urutan));
  const usable = () => { if (!st.p) return 0; const mk = missingKelas().length; return st.p.rows.filter((r) => st.mkKelas || !mk || !missingKelas().some((k) => k.nama === r.kelas)).length; };
  const refreshGo = () => { const b = $('#jmGo'); if (!b) return; const n = usable(); b.disabled = !st.p || !n || st.busy || !st.unit || !st.term; b.innerHTML = `${ico('upload')} Impor ${n} jam mengajar`; };
  const render = () => {
    const box = $('#jmPrev'); if (!box) return;
    if (!st.p) { box.innerHTML = ''; refreshGo(); return; }
    const p = st.p, mk = missingKelas(), mj = missingJam(), users = usersAll();
    const lama = jmRowsOf(st.unit, st.term).length;
    const linked = p.kodeList.filter((k) => st.peta[k.kode]).length;
    box.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3"><span class="chip selesai">${p.rows.length} baris jadwal</span><span class="chip unit">${p.kelas.length} kelas</span><span class="chip izin">${p.kodeList.length} kode guru</span><span class="chip ${linked === p.kodeList.length ? 'selesai' : 'sakit'}">${linked}/${p.kodeList.length} terhubung ke pengguna</span>${p.tanpaKode ? `<span class="chip neutral">${p.tanpaKode} baris tanpa kode guru</span>` : ''}</div>
      ${lama ? `<div class="info-box warn mb-3">${ico('warning')}<div>Unit <b>${esc(st.unit)}</b> pada term ini sudah punya <b>${lama}</b> baris jadwal. Impor akan <b>menggantinya seluruhnya</b>.</div></div>` : ''}
      ${mk.length ? `<div class="panel-tint mb-3"><label class="check-la"><input type="checkbox" id="jmMkK" ${st.mkKelas ? 'checked' : ''}><span><b class="text-strong">Tambahkan ${mk.length} kelas yang belum ada di Master</b><br><small class="muted">${esc(mk.map((k) => k.nama).join(', '))}. Bila tidak dicentang, jadwal kelas tersebut dilewati.</small></span></label></div>` : ''}
      ${mj.length ? `<div class="panel-tint mb-3"><label class="check-la"><input type="checkbox" id="jmMkJ" ${st.mkJam ? 'checked' : ''}><span><b class="text-strong">Lengkapi ${mj.length} jam pelajaran yang belum ada di Master</b><br><small class="muted">${esc(mj.map((j) => 'Jam ' + j.urutan + ' (' + j.mulai + '-' + j.selesai + ')').join(', '))}. Waktu diambil dari berkas Anda.</small></span></label></div>` : ''}
      <h4 class="mb-2" style="font-size:15px">${ico('badge', 'sm')} Hubungkan kode guru ke pengguna</h4>
      <p class="small-xs muted mb-2">Nama yang sama otomatis terhubung. Kode yang tidak dihubungkan tetap tersimpan, tetapi belum bisa dipakai untuk mengisi Cover Lesson otomatis.</p>
      <div class="table-wrap" style="max-height:340px;overflow:auto"><table class="table-la"><thead><tr><th>Kode</th><th>Nama di berkas</th><th>Jam</th><th style="min-width:230px">Pengguna aplikasi</th></tr></thead><tbody>
      ${p.kodeList.map((k) => `<tr><td><b>${esc(k.kode)}</b></td><td>${k.nama ? esc(k.nama) : '<i class="muted">tidak ada di daftar guru</i>'}</td><td>${k.n}</td><td><select class="select-la jmMap" data-k="${esc(k.kode)}"><option value="">- Tidak dihubungkan -</option>${users.map((u) => `<option value="${esc(u.id_pengguna)}" ${st.peta[k.kode] === u.id_pengguna ? 'selected' : ''}>${esc(u.nama)}${u.unit_id ? ' (' + esc(u.unit_id) + ')' : ''}</option>`).join('')}</select></td></tr>`).join('')}
      </tbody></table></div>`;
    const a = $('#jmMkK'); if (a) a.onchange = () => { st.mkKelas = a.checked; refreshGo(); };
    const b = $('#jmMkJ'); if (b) b.onchange = () => { st.mkJam = b.checked; };
    $$('.jmMap', box).forEach((s) => { s.onchange = () => { st.peta[s.dataset.k] = s.value; const ch = $$('.chip', box)[3]; if (ch) { const n = p.kodeList.filter((k) => st.peta[k.kode]).length; ch.textContent = `${n}/${p.kodeList.length} terhubung ke pengguna`; ch.className = 'chip ' + (n === p.kodeList.length ? 'selesai' : 'sakit'); } }; });
    refreshGo();
  };
  const onFile = async (file) => {
    if (!file) return;
    const err = checkFile(file, 8, ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '']);
    if (err) { toast('warn', 'Berkas belum valid', err); return; }
    $('#jmPrev').innerHTML = `<div class="muted small-xs d-flex align-items-center gap-2"><span class="spin" style="width:14px;height:14px"></span> Membaca berkas...</div>`;
    try {
      st.p = await jmRead(file);
      const users = usersAll();
      st.peta = {};
      st.p.kodeList.forEach((k) => { if (k.nama) { const id = jmMatch(k.nama, users); if (id) st.peta[k.kode] = id; } });
      $('#jmName').textContent = `${file.name} - sheet "${st.p.sheetName}"`;
      render();
    } catch (e) { st.p = null; $('#jmPrev').innerHTML = `<div class="info-box warn">${ico('error')}<div>${esc(e.message)}</div></div>`; refreshGo(); }
  };
  const go = async () => {
    if (!st.p || st.busy) return;
    st.busy = true; refreshGo(); $('#jmGo').innerHTML = `<span class="spin" style="width:14px;height:14px"></span> Mengimpor...`;
    try {
      const notes = [];
      const mk = missingKelas();
      if (st.mkKelas && mk.length) {
        const r = await run('importData', 'KELAS', mk.map((k, i) => ({ _baris: i + 1, unit: st.unit, nama_kelas: k.nama, tingkat: k.tingkat, aktif: 'TRUE' })));
        notes.push(`${r.baru} kelas ditambahkan`);
      }
      const mj = missingJam();
      if (st.mkJam && mj.length) {
        const r = await run('importData', 'JAM', mj.map((j, i) => ({ _baris: i + 1, unit: st.unit, urutan: j.urutan, mulai: j.mulai, selesai: j.selesai })));
        notes.push(`${r.baru} jam pelajaran ditambahkan`);
      }
      const rows = st.p.rows.filter((r) => st.mkKelas || !mk.some((k) => k.nama === r.kelas));
      const r = await run('importJadwalMengajar', st.unit, st.term, rows, st.peta);
      const g = r.galat || [];
      $('#jmPrev').innerHTML = `<div class="info-box">${ico('check_circle')}<div><b>Jadwal mengajar tersimpan.</b> ${r.baru} baris jadwal, ${r.terpetakan} di antaranya terhubung ke pengguna${r.dihapus ? `; ${r.dihapus} baris lama diganti` : ''}${notes.length ? '; ' + esc(notes.join(', ')) : ''}.${g.length ? ` ${g.length} baris dilewati.` : ''}</div></div>${g.length ? `<div class="small-xs mt-2">${g.slice(0, 20).map((x) => `Baris ${esc(x.baris)}: ${esc(x.pesan)}`).join('<br>')}</div>` : ''}`;
      $('#jmGo').style.display = 'none'; $('#jmDrop').style.display = 'none';
      toast('ok', 'Jadwal mengajar tersimpan', `${r.baru} baris`);
      J.unit = st.unit; J.term = st.term;
      syncNow(false);
    } catch (e) { st.busy = false; refreshGo(); toast('err', 'Impor gagal', e.message); }
  };
  modal({
    title: 'Impor Jadwal Mengajar', sub: 'Gunakan berkas jadwal pelajaran sekolah apa adanya (.xlsx)', icon: 'calendar_view_week', size: 'xl',
    body: `<div class="row g-3 mb-3">
        <div class="col-md-5"><label class="form-label-la" for="jmUnit">Unit</label><select class="select-la" id="jmUnit">${jmUnits().map((u) => `<option value="${esc(u.unit_id)}" ${u.unit_id === st.unit ? 'selected' : ''}>${esc(u.unit_id)} - ${esc(u.nama_lengkap)}</option>`).join('')}</select></div>
        <div class="col-md-7"><label class="form-label-la" for="jmTerm">Term</label><select class="select-la" id="jmTerm">${S.master.term.slice().sort((a, b) => a.tanggal_mulai.localeCompare(b.tanggal_mulai)).map((t) => `<option value="${esc(t.term_id)}" ${t.term_id === st.term ? 'selected' : ''}>${esc(jmTermLabel(t))} (${esc(t.tanggal_mulai)} s/d ${esc(t.tanggal_selesai)})</option>`).join('')}</select></div>
      </div>
      <div class="info-box mb-3">${ico('info')}<div>Berkas dibaca apa adanya: sheet <b>Semua Jadwal (Database)</b> (kolom Kelas, Hari, Jam Ke, Mata Pelajaran &amp; Kode Guru) dan sheet daftar kode guru. Hanya baris <b>KBM</b> yang diambil; Homeroom, Istirahat, dan Hand Over dilewati.</div></div>
      <label class="dropzone mb-3" id="jmDrop" style="width:100%;text-align:center"><input type="file" id="jmFile" accept=".xlsx,.xls" aria-label="Unggah jadwal pelajaran"><span class="dz-ico">${ico('upload_file')}</span><b class="text-strong d-block" id="jmName">Pilih atau tarik berkas jadwal pelajaran</b><small class="muted d-block">.xlsx, maksimal 8 MB</small></label>
      <div id="jmPrev"></div>`,
    foot: `<button class="btn-la btn-ghost" type="button" data-bs-dismiss="modal">Tutup</button><button class="btn-la btn-primary-la" type="button" id="jmGo" disabled>${ico('upload')} Impor 0 jam mengajar</button>`,
    onShow: () => {
      $('#jmUnit').onchange = (e) => { st.unit = e.target.value; render(); };
      $('#jmTerm').onchange = (e) => { st.term = e.target.value; render(); };
      $('#jmFile').onchange = (e) => onFile(e.target.files[0]);
      const dz = $('#jmDrop');
      dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
      dz.ondragleave = () => dz.classList.remove('drag');
      dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); };
      $('#jmGo').onclick = go;
      loadXlsx().catch(() => {});
    }
  });
}

function adminJadwalMengajar() {
  const J = jmDefaults(S.ui.adm.jm);
  const rows = jmRowsOf(J.unit, J.term);
  const kelas = S.master.kelas.filter((k) => k.unit_id === J.unit && isOn(k.aktif)).sort((a, b) => String(a.nama_kelas).localeCompare(String(b.nama_kelas), undefined, { numeric: true }));
  const gmap = {};
  rows.forEach((j) => { const key = j.pengguna_id || ('k:' + j.kode_guru); if (!gmap[key]) gmap[key] = { key, label: jmWho(j), n: 0, link: !!j.pengguna_id }; gmap[key].n++; });
  const gurus = Object.values(gmap).sort((a, b) => a.label.localeCompare(b.label));
  const items = J.mode === 'guru' ? gurus.map((g) => ({ v: g.key, l: g.label + (g.link ? '' : ' (belum terhubung)') })) : kelas.map((k) => ({ v: k.kelas_id, l: k.nama_kelas }));
  if (!items.some((x) => x.v === J.item)) J.item = (items[0] || {}).v || '';
  const sel = rows.filter((j) => (J.mode === 'guru' ? (j.pengguna_id || 'k:' + j.kode_guru) === J.item : j.kelas_id === J.item));
  const uruts = Array.from(new Set((S.idx.jamByUnit[J.unit] || []).map((j) => Number(j.urutan)).concat(sel.map((j) => Number(j.urutan))))).sort((a, b) => a - b);
  const jamOf = (u) => (S.idx.jamByUnit[J.unit] || []).find((x) => Number(x.urutan) === u);
  const days = [1, 2, 3, 4, 5];
  const cell = (d, u) => sel.filter((j) => Number(j.hari) === d && Number(j.urutan) === u).map((j) => `<div class="jm-it"><b>${esc(j.mapel)}</b><br><span class="small-xs ${j.pengguna_id || J.mode === 'guru' ? 'muted' : ''}">${esc(J.mode === 'guru' ? kelasName(j.kelas_id) : jmWho(j))}</span></div>`).join('');
  const belum = rows.filter((j) => !j.pengguna_id).length;
  const us = jmUnits(), terms = S.master.term.slice().sort((a, b) => a.tanggal_mulai.localeCompare(b.tanggal_mulai));
  return `<div class="card-la card-pad mb-3">
      <div class="row g-2 align-items-end">
        <div class="col-6 col-md-2"><label class="form-label-la" for="jmuU">Unit</label><select class="select-la" id="jmuU" onchange="App.jmSet('unit',this.value)">${us.map((u) => `<option value="${esc(u.unit_id)}" ${u.unit_id === J.unit ? 'selected' : ''}>${esc(u.unit_id)}</option>`).join('')}</select></div>
        <div class="col-6 col-md-3"><label class="form-label-la" for="jmuT">Term</label><select class="select-la" id="jmuT" onchange="App.jmSet('term',this.value)">${terms.map((t) => `<option value="${esc(t.term_id)}" ${t.term_id === J.term ? 'selected' : ''}>${esc(jmTermLabel(t))}</option>`).join('')}</select></div>
        <div class="col-6 col-md-2"><label class="form-label-la" for="jmuM">Lihat per</label><select class="select-la" id="jmuM" onchange="App.jmSet('mode',this.value)"><option value="kelas" ${J.mode !== 'guru' ? 'selected' : ''}>Kelas</option><option value="guru" ${J.mode === 'guru' ? 'selected' : ''}>Guru</option></select></div>
        <div class="col-6 col-md-2"><label class="form-label-la" for="jmuI">${J.mode === 'guru' ? 'Guru' : 'Kelas'}</label><select class="select-la" id="jmuI" onchange="App.jmSet('item',this.value)">${items.map((x) => `<option value="${esc(x.v)}" ${x.v === J.item ? 'selected' : ''}>${esc(x.l)}</option>`).join('')}</select></div>
        <div class="col-12 col-md-3 d-flex gap-2 justify-content-md-end"><button class="btn-la btn-primary-la" onclick="App.importJadwal()">${ico('upload_file')} Impor Jadwal</button>${rows.length ? `<button class="btn-la btn-danger-soft" onclick="App.hapusJm()" aria-label="Hapus jadwal term ini">${ico('delete')}</button>` : ''}</div>
      </div>
      <div class="d-flex flex-wrap gap-2 mt-3"><span class="chip unit">${rows.length} baris jadwal</span><span class="chip neutral">${kelas.length} kelas</span><span class="chip neutral">${gurus.length} guru</span>${belum ? `<span class="chip sakit">${belum} baris belum terhubung ke pengguna</span>` : ''}</div>
    </div>
    ${rows.length ? `<div class="card-la"><div class="table-wrap p-2"><table class="table-la" style="table-layout:fixed;min-width:760px"><thead><tr><th style="width:96px">Jam</th>${days.map((d) => `<th>${HARI[d % 7]}</th>`).join('')}</tr></thead><tbody>
      ${uruts.map((u) => { const j = jamOf(u); return `<tr><td><b>Jam ${u}</b>${j ? `<br><span class="small-xs muted">${esc(j.mulai)}-${esc(j.selesai)}</span>` : ''}</td>${days.map((d) => `<td>${cell(d, u)}</td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div></div>`
    : `<div class="card-la card-pad"><div class="empty py-4">${ico('calendar_view_week')}<b>Belum ada jadwal mengajar untuk ${esc(J.unit)} pada term ini</b>Tekan "Impor Jadwal" lalu pilih berkas jadwal pelajaran sekolah Anda.</div></div>`}`;
}
async function hapusJm() {
  const J = S.ui.adm.jm;
  const ok = await confirmDlg({ title: 'Hapus jadwal mengajar?', danger: true, msg: `Seluruh jadwal mengajar unit ${J.unit} pada term ini akan dihapus.`, ok: 'Ya, hapus' });
  if (!ok) return;
  try { const r = await run('hapusJadwalMengajar', J.unit, J.term); toast('ok', 'Jadwal dihapus', `${r.dihapus} baris`); syncNow(false); } catch (e) { toast('err', 'Gagal menghapus', e.message); }
}
function jmSet(k, v) { const J = S.ui.adm.jm; J[k] = v; if (k === 'mode' || k === 'unit' || k === 'term') J.item = ''; renderAdmin(); }

/** Isi slot Cover Lesson dari jadwal mengajar guru yang berhalangan. */
function fIsiJadwal() {
  const F = S.form, p = pegById(F.pengguna_id);
  if (!p.unit_id) { toast('warn', 'Pilih pegawai dahulu'); return; }
  const jams = S.idx.jamByUnit[p.unit_id] || [];
  const idOf = (u) => (jams.find((j) => Number(j.urutan) === Number(u)) || {}).jam_id || '';
  const mine = (S.data.jmengajar || []).filter((j) => j.pengguna_id === p.id_pengguna && j.unit_id === p.unit_id);
  const add = []; let tanpaJam = 0, lewat = 0, tim = 0;
  for (let d = F.tanggal_mulai; d <= F.tanggal_berakhir && add.length < 80; d = addDays(d, 1)) {
    if (!hariKerja(d, p.unit_id)) continue;
    const t = termOf(d); if (!t) continue;
    const hr = hariNo(d);
    const hari = mine.filter((j) => j.term_id === t.term_id && Number(j.hari) === hr).sort((a, b) => Number(a.urutan) - Number(b.urutan));
    let cur = null;
    const flush = () => { if (cur) { add.push(cur); cur = null; } };
    hari.forEach((j) => {
      const u = Number(j.urutan);
      if (Number(j.tim) > 1) { tim++; return; }   // kegiatan tim lintas kelas (mis. PDD): atur manual
      if (cur && cur.kelas_id === j.kelas_id && cur.mata_pelajaran === j.mapel && u === cur._u + 1) { cur._u = u; cur.jam_akhir_id = idOf(u) || cur.jam_akhir_id; if (!idOf(u)) tanpaJam++; return; }
      flush();
      if (!idOf(u)) { tanpaJam++; return; }
      cur = { tanggal: d, kelas_id: j.kelas_id, jam_awal_id: idOf(u), jam_akhir_id: idOf(u), mata_pelajaran: j.mapel, instruksi: '', guru_piket_id: '', _u: u };
    });
    flush();
  }
  const fresh = add.filter((a) => !F.kelas.some((k) => k.tanggal === a.tanggal && k.kelas_id === a.kelas_id && k.jam_awal_id === a.jam_awal_id));
  lewat = add.length - fresh.length;
  if (!fresh.length) { toast('info', 'Tidak ada jadwal yang bisa ditambahkan', tim ? `Hanya ada ${tim} jam kegiatan tim (mis. PDD) yang tidak diisi otomatis.` : add.length ? 'Semua jadwal pada rentang ini sudah ada di daftar.' : `Tidak ada jam mengajar ${p.nama || 'guru ini'} pada tanggal tersebut (atau jadwal belum diimpor).`); return; }
  fresh.forEach((a) => { delete a._u; F.kelas.push(a); });
  F.kelas.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || Number((S.idx.jam[a.jam_awal_id] || {}).urutan || 99) - Number((S.idx.jam[b.jam_awal_id] || {}).urutan || 99));
  renderSlots(); renderSummary(); saveDraft();
  toast('ok', `${fresh.length} slot ditambahkan dari jadwal mengajar`, (lewat ? `${lewat} sudah ada. ` : '') + (tanpaJam ? `${tanpaJam} jam dilewati karena Jam Pelajaran belum diatur. ` : '') + (tim ? `${tim} jam kegiatan tim (mis. PDD) tidak diisi otomatis; tambahkan manual bila perlu. ` : '') + 'Periksa lalu lengkapi instruksi tugas.');
}

function adminPengaturan() {
  const s = S.admin.pengaturan;
  const ta = S.master.tahun, tm = S.master.term;
  return `<div class="row g-4"><div class="col-xl-7"><div class="card-la form-section">
      <div class="fs-head"><span class="stat-ico ico-primary">${ico('apartment')}</span><div><h3>Identitas &amp; Operasional</h3><p>Berlaku untuk seluruh pengguna</p></div></div>
      <form id="setForm" novalidate onsubmit="App.saveSet(event)"><div class="row g-3">
        <div class="col-12"><label class="form-label-la" for="sNama">Nama Sekolah</label><input class="input-la" id="sNama" value="${esc(s.nama_sekolah || '')}"></div>
        <div class="col-sm-6"><label class="form-label-la" for="sTA">Tahun Ajaran Aktif</label><select class="select-la" id="sTA">${ta.map((t) => `<option value="${t.tahun_id}" ${t.tahun_id === s.tahun_ajaran_aktif ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
        <div class="col-sm-6"><label class="form-label-la" for="sTerm">Term Aktif</label><select class="select-la" id="sTerm">${tm.map((t) => `<option value="${t.term_id}" ${t.term_id === s.term_aktif ? 'selected' : ''}>${esc((S.idx.tahun[t.tahun_id] || {}).label || '')} · Term ${esc(t.nomor)}</option>`).join('')}</select></div>
        <div class="col-sm-6"><label class="form-label-la" for="sTarget">Target Kehadiran Minimum (%)</label><input class="input-la" id="sTarget" type="number" min="1" max="100" value="${esc(s.target_kehadiran || 90)}"></div>
        <div class="col-sm-6"><label class="form-label-la" for="sKontak">Email Kontak Admin / TU</label><input class="input-la" id="sKontak" type="email" value="${esc(s.kontak_admin || '')}"><div class="help">Ditampilkan di halaman Akses Ditolak.</div></div>
        <div class="col-12"><label class="form-label-la" for="sDomain">Batasi domain email pengguna (opsional)</label><input class="input-la" id="sDomain" placeholder="sekolah.sch.id" value="${esc(s.domain_email || '')}"><div class="help">Bila diisi, email baru wajib berdomain ini.</div></div>
        <div class="col-12"><label class="check-la panel-tint"><span class="switch-la"><input type="checkbox" id="sNotif" ${isOn(s.notifikasi_aktif) ? 'checked' : ''}><span></span></span><span><b class="text-strong">Notifikasi Email Otomatis</b><br><small class="muted">Kirim email ke Kepala Sekolah unit &amp; guru piket saat absen dicatat dan cover ditugaskan.</small></span></label></div>
        <div class="col-12"><button class="btn-la btn-primary-la" type="submit">${ico('save')} Simpan Pengaturan</button></div>
      </div></form></div></div>
    <div class="col-xl-5">
      <div class="card-la card-pad mb-3"><h3 class="mb-3">${ico('image')} Logo Sekolah</h3><div class="d-flex gap-3 align-items-center"><span class="logo-mark" style="width:72px;height:72px;border-radius:16px">${S.app.logo ? `<img src="${S.app.logo}" alt="Logo">` : ico('school', 'xl')}</span>
        <label class="btn-la btn-soft" style="position:relative">${ico('upload')} Ganti Logo<input type="file" accept="image/png,image/jpeg" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="App.uploadLogo(this.files[0])" aria-label="Unggah logo"></label></div><div class="help mt-2">PNG/JPG maks. 1 MB, tampil di kiri atas.</div></div>
      <div class="card-la card-pad mb-3"><h3 class="mb-3">${ico('monitor_heart')} Status Sistem</h3>
        <div class="kv"><span>Pemicu antrean email</span><span>${S.admin.pemicu ? '<span class="chip selesai">Terpasang</span>' : '<span class="chip gagal">Belum</span>'}</span></div>
        <div class="kv"><span>Email dalam antrean</span><span>${S.admin.antrean}</span></div>
        <div class="kv"><span>Sisa kuota email hari ini</span><span>${S.admin.kuotaEmail < 0 ? '—' : num(S.admin.kuotaEmail)}</span></div>
        <div class="kv"><span>Versi aplikasi</span><span>${esc(S.app.version)}</span></div></div>
      <div class="card-la card-pad"><h3 class="mb-2">${ico('cleaning_services')} Data Contoh</h3><p class="small-xs muted">Hapus seluruh pengguna, absen, cover, jadwal piket, dan log contoh (ID berawalan “demo-”) setelah uji coba selesai. Akun Anda dan data master tidak terhapus.</p>
        <button class="btn-la btn-danger-soft" onclick="App.hapusDemo()">${ico('delete_sweep')} Hapus Data Contoh</button></div>
    </div></div>`;
}
function saveSet(e) {
  e.preventDefault();
  const map = { nama_sekolah: $('#sNama').value, tahun_ajaran_aktif: $('#sTA').value, term_aktif: $('#sTerm').value, target_kehadiran: $('#sTarget').value, kontak_admin: $('#sKontak').value, domain_email: $('#sDomain').value, notifikasi_aktif: $('#sNotif').checked ? 'TRUE' : 'FALSE' };
  const before = clone(S.admin.pengaturan), beforeApp = clone(S.app);
  Object.assign(S.admin.pengaturan, map);
  Object.assign(S.app, { sekolah: map.nama_sekolah, notifAktif: map.notifikasi_aktif === 'TRUE', target: Number(map.target_kehadiran) || 90, termAktif: map.term_aktif, tahunAktif: map.tahun_ajaran_aktif });
  refreshView(); toast('ok', 'Pengaturan disimpan');
  run('savePengaturan', map).then(() => syncSoon()).catch((err) => { S.admin.pengaturan = before; S.app = beforeApp; refreshView(); toast('err', 'Gagal menyimpan', err.message); });
}
function uploadLogoFile(file) {
  const err = checkFile(file, 1, ['image/png', 'image/jpeg']);
  if (err) { toast('warn', 'Logo tidak valid', err); return; }
  readFile(file).then((f) => { const prev = S.app.logo; S.app.logo = `data:${f.mime};base64,${f.data}`; refreshView(); return run('uploadLogo', { name: f.name, mime: f.mime, data: f.data }).catch((e) => { S.app.logo = prev; refreshView(); throw e; }); })
    .then(() => toast('ok', 'Logo diperbarui')).catch((e) => toast('err', 'Gagal mengunggah logo', e.message));
}
async function hapusDemo() {
  if (!(await confirmDlg({ title: 'Hapus semua data contoh?', msg: 'Tindakan ini tidak dapat dibatalkan. Data nyata yang Anda masukkan tidak ikut terhapus.', danger: true, ok: 'Ya, hapus data contoh' }))) return;
  toast('info', 'Menghapus data contoh…');
  run('hapusDataContoh').then((r) => { toast('ok', 'Data contoh dihapus', Object.values(r.dihapus).reduce((a, b) => a + b, 0) + ' baris dihapus.'); syncNow(true); }).catch((e) => toast('err', 'Gagal', e.message));
}

// ── Jadwal Piket mingguan (Admin) ────────────────────────────────────────────
function adminPiket() {
  const A = S.ui.adm;
  if (!A.minggu) A.minggu = mondayOf(S.today);
  const days = [0, 1, 2, 3, 4].map((i) => addDays(A.minggu, i));
  const unitSel = A.punit;
  const rows = S.data.piket.filter((p) => p.tanggal >= days[0] && p.tanggal <= days[4] && (unitSel === 'ALL' || p.unit_id === unitSel));
  const pagi = rows.filter((p) => p.shift !== 'SIANG').length, siang = rows.length - pagi;
  const guruN = new Set(rows.map((p) => p.pengguna_id)).size;
  const card = (lbl, v, sub, icon, color) => `<div class="col-md-4"><div class="card-la stat-card flex-row justify-content-between align-items-center"><div><div class="eyebrow" style="color:var(--text-2)">${lbl}</div><div class="stat-value" style="font-size:30px;color:${color}">${v}</div><div class="stat-foot">${sub}</div></div><span class="stat-ico" style="width:56px;height:56px;background:var(--surface-tint);color:${color}">${ico(icon, 'xl')}</span></div></div>`;
  return `<div class="card-la card-pad py-3 mb-3 d-flex flex-wrap gap-3 align-items-center justify-content-between">
      <div class="d-flex align-items-center gap-2 flex-wrap"><span class="fw-semibold text-strong">Filter Unit Sekolah:</span><div class="unit-pills">${['ALL'].concat(S.idx.unitList.map((u) => u.unit_id)).map((u) => `<button type="button" class="${unitSel === u ? 'active' : ''}" onclick="App.admSet('punit','${u}')">${u === 'ALL' ? 'Semua Unit' : u}</button>`).join('')}</div></div>
      <div class="d-flex gap-2 align-items-center flex-wrap"><div class="date-chip" style="padding:0 4px"><button class="icon-btn" style="width:36px;height:36px" onclick="App.admWeek(-1)" aria-label="Minggu sebelumnya">${ico('chevron_left')}</button><span>${esc(fmtShort(days[0]))} - ${esc(fmtMid(days[4]))}</span><button class="icon-btn" style="width:36px;height:36px" onclick="App.admWeek(1)" aria-label="Minggu berikutnya">${ico('chevron_right')}</button></div>
        <button class="btn-la btn-primary-la" onclick="App.addPiket()">${ico('person_add')} Tambah Penugasan Piket</button></div></div>
    <div class="row g-3 mb-3">${card('Total Guru Bertugas', guruN + ' Guru', rows.length + ' penugasan minggu ini', 'badge', 'var(--text)')}${card('Shift Pagi', pagi + ' Penugasan', 'Sambut siswa & presensi pagi', 'light_mode', 'var(--primary-strong)')}${card('Shift Siang', siang + ' Penugasan', 'Pengawasan istirahat & pulang', 'wb_twilight', 'var(--cover)')}</div>
    <div class="week-grid">${days.map((d) => { const list = rows.filter((p) => p.tanggal === d).sort((a, b) => a.shift.localeCompare(b.shift) || a.unit_id.localeCompare(b.unit_id)); return `<div class="day-col ${d === S.today ? 'today' : ''}">
        <div class="day-head"><div><b>${HARI[dow(d)]}</b><small>${esc(fmtMid(d))}</small></div><span class="chip unit">${list.length} Guru</span></div>
        <div class="day-body">${list.map((p) => `<div class="piket-card">${pending(p)}<div class="row1">${avatar(p.pengguna_id, nama(p.pengguna_id), 'sm')}<div><b>${esc(nama(p.pengguna_id))}</b><small>${esc(pegById(p.pengguna_id).bidang_studi || '')}</small></div></div>
          <div class="row2"><span class="chip ${p.shift === 'SIANG' ? 'shift-siang' : 'shift-pagi'}">${ico(p.shift === 'SIANG' ? 'wb_twilight' : 'light_mode', 'sm')} Shift ${p.shift === 'SIANG' ? 'Siang' : 'Pagi'}</span><span class="chip unit">${esc(p.unit_id)}</span></div>
          <button class="del" onclick="App.delPiket('${p.piket_id}')" aria-label="Hapus penugasan ${esc(nama(p.pengguna_id))}">${ico('close', 'sm')}</button></div>`).join('') || '<div class="small-xs muted text-center py-3">Belum ada guru piket</div>'}</div>
        <div class="p-2"><button class="btn-la btn-soft w-100 btn-sm-la" onclick="App.addPiket('${d}')">${ico('add', 'sm')} Tambah Guru Piket</button></div></div>`; }).join('')}</div>`;
}
function addPiket(tgl) {
  const A = S.ui.adm;
  const days = [0, 1, 2, 3, 4].map((i) => addDays(A.minggu, i));
  const unitOpts = S.idx.unitList.map((u) => ({ v: u.unit_id, l: u.unit_id + ' — ' + u.nama_lengkap }));
  const defUnit = A.punit !== 'ALL' ? A.punit : (S.idx.unitList[0] || {}).unit_id;
  const guruOpts = (unit) => S.admin.pengguna.filter((u) => isOn(u.aktif) && (!unit || u.unit_id === unit) && (S.idx.jenis[u.jenis_id] || {}).nama !== 'Keamanan').sort((a, b) => a.nama.localeCompare(b.nama));
  modal({
    title: 'Tambah Penugasan Piket', sub: 'Guru piket menjadi pilihan saat TU/Kepala Sekolah menugaskan cover', icon: 'person_add', size: 'md',
    body: `<form id="pkForm" novalidate><div class="row g-3">
      <div class="col-sm-6"><label class="form-label-la" for="pkUnit">Unit <span class="req">*</span></label><select class="select-la" id="pkUnit">${unitOpts.map((o) => `<option value="${o.v}" ${o.v === defUnit ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></div>
      <div class="col-sm-6"><label class="form-label-la" for="pkShift">Shift <span class="req">*</span></label><select class="select-la" id="pkShift"><option value="PAGI">Shift Pagi</option><option value="SIANG">Shift Siang</option></select></div>
      <div class="col-12"><label class="form-label-la" for="pkGuru">Guru <span class="req">*</span></label><select class="select-la" id="pkGuru" required></select><div class="field-err">Pilih guru.</div></div>
      <div class="col-12"><label class="form-label-la">Hari bertugas <span class="req">*</span></label><div class="d-flex flex-wrap gap-2">${days.map((d) => `<label class="check-la panel-tint py-2 px-3"><input type="checkbox" class="pk-day" value="${d}" ${(tgl ? d === tgl : true) ? 'checked' : ''}><span>${HARI_S[dow(d)]}, ${esc(fmtShort(d))}</span></label>`).join('')}</div></div>
    </div></form>`,
    foot: `<button class="btn-la btn-ghost" data-bs-dismiss="modal">Batal</button><button class="btn-la btn-primary-la" type="submit" form="pkForm">${ico('check')} Simpan Penugasan</button>`,
    onShow: () => {
      const fill = () => { const g = guruOpts($('#pkUnit').value); $('#pkGuru').innerHTML = `<option value="">— Pilih guru —</option>${g.map((u) => `<option value="${u.id_pengguna}">${esc(u.nama)} — ${esc(u.bidang_studi || '')}</option>`).join('')}`; };
      fill(); $('#pkUnit').onchange = fill;
      $('#pkForm').onsubmit = (e) => {
        e.preventDefault();
        const guru = $('#pkGuru').value, unit = $('#pkUnit').value, shift = $('#pkShift').value;
        const ds = $$('.pk-day').filter((c) => c.checked).map((c) => c.value);
        $('#pkGuru').classList.toggle('is-invalid', !guru);
        if (!guru) return;
        if (!ds.length) { toast('warn', 'Pilih minimal satu hari'); return; }
        const rows = ds.filter((d) => !S.data.piket.some((p) => p.tanggal === d && p.pengguna_id === guru && p.unit_id === unit && p.shift === shift)).map((d) => ({ piket_id: uid(), tanggal: d, unit_id: unit, pengguna_id: guru, shift, _pending: true }));
        if (!rows.length) { toast('info', 'Penugasan sudah ada'); closeModal(); return; }
        closeModal();
        S.data.piket.push(...rows); refreshView();
        toast('ok', 'Penugasan piket ditambahkan', `${nama(guru)} · ${rows.length} hari`);
        run('saveJadwalPiket', rows.map((r) => ({ tanggal: r.tanggal, unit_id: r.unit_id, pengguna_id: r.pengguna_id, shift: r.shift }))).then((r) => {
          S.data.piket = S.data.piket.filter((p) => !rows.includes(p)).concat(r.rows); refreshView();
        }).catch((err) => { S.data.piket = S.data.piket.filter((p) => !rows.includes(p)); refreshView(); toast('err', 'Gagal menyimpan jadwal piket', err.message); });
      };
    }
  });
}
function delPiket(id) {
  const p = S.data.piket.find((x) => x.piket_id === id); if (!p) return;
  const used = S.data.cover.some((k) => k.guru_piket_id === p.pengguna_id && k.tanggal === p.tanggal && k.unit_id === p.unit_id && k.status !== 'BELUM_DITUGASKAN');
  if (used) { toast('warn', 'Tidak dapat dihapus', 'Guru ini sudah ditugaskan cover pada tanggal tersebut.'); return; }
  const i = S.data.piket.indexOf(p); S.data.piket.splice(i, 1); refreshView();
  toast('ok', 'Penugasan dihapus', nama(p.pengguna_id), { action: 'Urungkan', onAction: () => { S.data.piket.splice(i, 0, p); refreshView(); run('saveJadwalPiket', [{ tanggal: p.tanggal, unit_id: p.unit_id, pengguna_id: p.pengguna_id, shift: p.shift }]).then((r) => { S.data.piket = S.data.piket.filter((x) => x !== p).concat(r.rows); refreshView(); }); } });
  if (String(id).indexOf('tmp-') === 0) return;
  run('hapusJadwalPiket', id).catch((e) => { S.data.piket.splice(i, 0, p); refreshView(); toast('err', 'Gagal menghapus', e.message); });
}

// ════════════════════════════════════════════════════════════════════════════
// 14. PROFIL, NOTIFIKASI, SIMULASI, SINKRON LATAR
// ════════════════════════════════════════════════════════════════════════════
function openProfile() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const others = menuItems().filter((k) => !$$('#bottomNav button').some((b) => (b.getAttribute('onclick') || '').includes(`'${k}'`)));
  modal({
    title: S.me.nama, sub: S.me.jabatan, icon: 'person', size: 'md',
    body: `<div class="kv"><span>Email</span><span style="word-break:break-all">${esc(S.me.email || S.real.email)}</span></div>
      <div class="kv"><span>Unit</span><span>${esc(S.me.unit_id || 'Semua unit')}</span></div>
      <div class="kv"><span>Cakupan data</span><span>${S.cakupan === 'SEMUA' ? 'Semua unit' : S.cakupan === 'UNIT' ? 'Unit sendiri' : 'Data pribadi'}</span></div>
      <label class="check-la panel-tint mt-3"><span class="switch-la"><input type="checkbox" ${dark ? 'checked' : ''} onchange="App.toggleTheme()"><span></span></span><span><b class="text-strong">Mode Gelap</b><br><small class="muted">Tersimpan di perangkat ini</small></span></label>
      ${others.length ? `<h3 class="mt-4 mb-2">Menu Lainnya</h3><div class="d-grid gap-2">${others.map((k) => `<button class="btn-la btn-soft justify-content-start" onclick="App.closeModal();App.go('${k}')">${ico(PAGES[k].i)} ${esc(PAGES[k].t)}</button>`).join('')}</div>` : ''}
      ${S.perm.kelola_pengguna && S.admin ? `<button class="btn-la btn-soft justify-content-start w-100 mt-2" onclick="App.closeModal();App.go('admin')">${ico('manage_accounts')} Pengguna &amp; Peran</button>` : ''}
      <div class="small-xs muted mt-4">LEARNING ACTIVITY v${esc(S.app.version)} · ${esc(S.app.sekolah)}<br>Masuk dengan akun Google sekolah · sesi berlaku 12 jam.</div>`,
    foot: `${S.real.simulasi ? `<button class="btn-la btn-cover" onclick="App.closeModal();App.simulasi(null)">${ico('visibility_off')} Keluar simulasi</button>` : ''}<button class="btn-la btn-danger-soft me-auto" onclick="App.closeModal();App.logout()">${ico('logout')} Keluar</button><button class="btn-la btn-ghost" data-bs-dismiss="modal">Tutup</button>`
  });
}
function toggleNotif(e) {
  e.stopPropagation();
  const d = $('#notifDrop'); const show = !d.classList.contains('show');
  d.classList.toggle('show', show); $('#notifBtn').setAttribute('aria-expanded', show);
  if (show) {
    const list = (S.data.notif || []).slice(-10).reverse();
    d.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2 px-1"><b class="text-strong">Log Notifikasi Email</b><span class="small-xs muted">${S.app.notifAktif ? 'Aktif' : 'Nonaktif'}</span></div>${list.length ? list.map((n) => `<div class="notif-row py-2">${ico('mail', 'sm')}<div style="min-width:0;flex:1"><b class="small-xs" style="font-size:13px">${esc(n.subjek.replace('[LEARNING ACTIVITY] ', ''))}</b><small>${esc(n.penerima)} · ${esc(fmtDT(n.waktu))}</small></div>${n.status === 'TERKIRIM' ? '<span class="chip selesai">✓</span>' : n.status === 'GAGAL' ? '<span class="chip gagal">!</span>' : '<span class="chip antri">…</span>'}</div>`).join('') : emptyState('drafts', 'Belum ada notifikasi', '')}`;
    $('#notifDot').hidden = true;
  }
}
function simulasi(id) {
  toast('info', id ? 'Memuat tampilan simulasi…' : 'Kembali ke akun Anda…');
  run('setSimulasi', id).then((boot) => {
    S.form = null; S.extra = {}; S.tanggal = boot.today; S.detailId = '';
    applyBoot(boot); cacheBoot(boot); go('beranda');
    toast('ok', id ? `Simulasi: ${boot.me.nama}` : 'Simulasi selesai', id ? boot.me.jabatan : '');
  }).catch((e) => toast('err', 'Gagal', e.message));
}

/** Sinkron latar: ringan bila versi sama; tarik data penuh bila berubah. */
let syncing = false;
function syncNow(manual) {
  if (syncing || pendingOps) return;
  syncing = true; S.lastSync = Date.now();
  run('syncData', S.ver).then((r) => {
    syncing = false;
    if (r.changed && r.boot) {
      const keepDate = S.tanggal; applyBoot(r.boot); cacheBoot(r.boot); S.tanggal = keepDate; S.extra = {};
      refreshView(); if (manual) toast('ok', 'Data diperbarui');
    } else if (manual) toast('info', 'Data sudah terbaru');
    setSync(`${ico('cloud_done', 'sm')} Tersinkron`);
  }).catch(() => { syncing = false; });
}
const syncSoon = debounce(() => syncNow(false), 2500);

// ════════════════════════════════════════════════════════════════════════════
// 15. HALAMAN AKSES DITOLAK
// ════════════════════════════════════════════════════════════════════════════
function renderDenied(b) {
  $('#appRoot').hidden = true; $('#loginRoot').hidden = true; Auth.hideSplash();
  const reasons = {
    TIDAK_TERDAFTAR: ['Email Anda Belum Didaftarkan', 'Autentikasi Google berhasil, namun akun ini tidak terhubung dengan izin tugas atau unit sekolah aktif.'],
    EMAIL_TIDAK_TERBACA: ['Email Tidak Dapat Dibaca', 'Aplikasi tidak dapat membaca email akun Google Anda. Silakan masuk kembali.'],
    BELUM_SETUP: ['Aplikasi Belum Dipasang', 'Admin perlu menjalankan setupAppEnvironment() di editor Apps Script terlebih dahulu.']
  }[b.reason] || ['Akses Ditolak', ''];
  const root = $('#deniedRoot');
  root.hidden = false;
  root.innerHTML = `<span class="portal-pill"><i></i> PORTAL KEAMANAN PRESENSI &amp; JADWAL</span>
    <div class="denied-card">
      <div class="denied-ico">${ico('person_off', 'xl')}<span class="lock">${ico('lock', 'sm')}</span></div>
      <div class="code">AKSES DITOLAK (403)</div>
      <h1>${esc(reasons[0])}</h1>
      <p class="lead">${esc(reasons[1])}</p>
      <div class="denied-info">
        <div class="row-i box-white">${ico('alternate_email')} Email terdeteksi <b>${esc(b.email || '(tidak terbaca)')}</b></div>
        <div class="row-i">${ico('schedule')} Waktu percobaan <b style="font-weight:500">${esc(b.waktu)}</b></div>
        <div class="info-box" style="background:var(--surface)">${ico('verified_user')}<div>Sistem <b>${esc(b.appName)}</b> hanya mengizinkan email resmi yang telah didaftarkan oleh Administrator pada lembar <b style="color:var(--primary)">Pengguna &amp; Peran</b>.</div></div>
      </div>
      <div class="d-grid gap-2 mt-4">
        <button type="button" class="btn-la btn-primary-la" onclick="App.logout('Pilih akun Google sekolah yang sudah didaftarkan Admin.')">${ico('switch_account')} Coba Akun Lain (Ganti Akun Google)</button>
        ${b.kontak ? `<a class="btn-la btn-soft" href="mailto:${esc(b.kontak)}?subject=${encodeURIComponent('Permohonan akses LEARNING ACTIVITY')}&body=${encodeURIComponent('Mohon daftarkan email saya: ' + (b.email || ''))}" target="_blank" rel="noopener">${ico('support_agent')} Hubungi Tim Admin / Tata Usaha (TU)</a>` : ''}
      </div>
      <details><summary>${ico('info', 'sm')} Mengapa saya melihat halaman ini? <span class="msi ms-auto">expand_more</span></summary>
        <p>Akses aplikasi hanya untuk email yang didaftarkan Admin sekolah. Bila Anda guru/karyawan baru, minta Admin atau TU menambahkan email Anda di menu Pengguna &amp; Peran, lalu masuk kembali. Pastikan juga Anda masuk dengan akun Google sekolah, bukan akun pribadi.</p></details>
    </div>
    <div class="small-xs muted">${esc(b.sekolah)} · ${esc(b.appName)}</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// 16. API PUBLIK UNTUK HANDLER INLINE & INISIALISASI
// ════════════════════════════════════════════════════════════════════════════
const App = {
  go, closeModal, openDrawer, closeDrawer, openProfile, toggleNotif, simulasi, preview, detailAbsen, ubahStatus, batalkan,
  tugaskan, lepas, coverInfo, selesai, lapor, segPick, uploadJadwal, quickJadwal, arsipJadwal, exportHarian, exportRekap,
  editUser, permSet, addPeran, delPeran, editMaster, delMaster, importExcel, importJadwal, jmSet, hapusJm, fIsiJadwal, saveSet, hapusDemo, addPiket, delPiket,
  fSet, fPegQ, fAddSlot, fDelSlot, fSlot, fFile, fClearFile, fReset, submitAbsen, syncNow,
  uploadLogo: uploadLogoFile,
  toggleTheme() { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); },
  setUnit(u) { S.unit = u; ls.set('unit', u); S.ui.keh.page = 1; S.ui.rek.page = 1; renderNav(); renderTopbar(); render(S.page); },
  setDate(d) { if (!d) return; S.tanggal = d; renderNav(); renderTopbar(); render(S.page); },
  berSearch: debounce((q) => { S.ui.ber.q = q; render('beranda'); const i = $('#view-beranda .search-box input'); if (i) { i.focus(); i.setSelectionRange(q.length, q.length); } }, 200),
  berStatus(v) { S.ui.ber.st = v; render('beranda'); },
  kehFilter(k, v) { S.ui.keh[k] = v; S.ui.keh.page = 1; if (k === 'q') return App._kehQ(); render('kehadiran'); },
  _kehQ: debounce(() => { render('kehadiran'); const i = $('#view-kehadiran .search-box input'); if (i) { i.focus(); const n = i.value.length; i.setSelectionRange(n, n); } }, 200),
  filterKeh(st) { S.ui.keh.st = st; S.ui.keh.page = 1; render('kehadiran'); },
  kehPage(n) { S.ui.keh.page = n; render('kehadiran'); },
  covFilter(v) { S.ui.cov.st = v; render('cover'); },
  tugDate(d) { S.ui.tug.tgl = d; render('tugas'); },
  jt(k, v) { S.ui.jt[k] = v; if (k === 'tahun') S.ui.jt.term = ''; render('jadwal'); },
  rk(k, v) {
    const R = S.ui.rek;
    if (k === 'reset') { R.mulai = ''; R.selesai = ''; R.term = S.app.termAktif || ''; R.tahun = termAktif().tahun_id; }
    else if (k === 'term') { R.term = v; R.mulai = ''; R.selesai = ''; }
    else if (k === 'tahun') { R.tahun = v; R.term = ''; R.mulai = ''; R.selesai = ''; }
    else R[k] = v;
    R.page = 1; render(S.page);
  },
  rkSearch: debounce((q) => { S.ui.rek.q = q; S.ui.rek.page = 1; render('rekap'); const i = $('#view-rekap .search-box input'); if (i) { i.focus(); i.setSelectionRange(q.length, q.length); } }, 200),
  rkSort(k) { const R = S.ui.rek; if (R.sort === k) R.dir = -R.dir; else { R.sort = k; R.dir = k === 'nama' || k === 'unit' ? 1 : -1; } render('rekap'); },
  rkPage(n) { S.ui.rek.page = n; render('rekap'); },
  admTab(t) { S.ui.adm.tab = t; renderAdmin(); },
  admQ: debounce((q) => { S.ui.adm.q = q; renderAdmin(); const i = $('#view-admin .search-box input'); if (i) { i.focus(); i.setSelectionRange(q.length, q.length); } }, 200),
  admSet(k, v) { S.ui.adm[k] = v; renderAdmin(); },
  admWeek(n) { S.ui.adm.minggu = addDays(S.ui.adm.minggu || mondayOf(S.today), 7 * n); renderAdmin(); },
  onChartReady() { while (chartQueue.length) { try { chartQueue.shift()(); } catch (e) { console.warn(e); } } },
  startWithBoot, showDenied: renderDenied,
  logout(msg) { if (pendingOps && !confirm('Masih ada perubahan yang sedang disimpan. Tetap keluar?')) return; Object.values(S.charts).forEach((c) => { try { c.destroy(); } catch (e) { /* abaikan */ } }); S.charts = {}; Auth.logout(msg); }
};
window.App = App;

/** Simpan data terakhir di perangkat agar buka-ulang aplikasi instan. */
function cacheBoot(b) { if (b && b.real) ls.set('boot_' + b.real.email, b); }

let started = false;
/** Masuk ke aplikasi dengan data awal (dari login, cache, atau server). */
function startWithBoot(b, fresh) {
  if (fresh) { S.form = null; S.extra = {}; S.tanggal = ''; S.detailId = ''; S.charts = {}; }
  applyBoot(b);
  cacheBoot(b);
  $('#loginRoot').hidden = true; $('#deniedRoot').hidden = true; $('#appRoot').hidden = false;
  const last = ls.get('page', 'beranda');
  go(started && canOpen(S.page) ? S.page : (canOpen(last) && last !== 'rekapDetail' ? last : 'beranda'));
  Auth.hideSplash();
  if (window.Chart) App.onChartReady();
  setSync(`${ico('cloud_done', 'sm')} Tersinkron`);
  if (fresh) toast('ok', `Selamat datang, ${shortName(b.me.nama)}`, b.me.jabatan);
  if (!started) { started = true; wireGlobal(); }
}

function wireGlobal() {
  // Sinkron latar: tiap 60 dtk saat tab terlihat, dan saat kembali ke tab
  setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine !== false && Api.getSession() && !$('#appRoot').hidden) syncNow(false); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Api.getSession() && !$('#appRoot').hidden && Date.now() - S.lastSync > 20000) syncNow(false); });
  window.addEventListener('online', () => { document.body.classList.remove('is-offline'); if (Api.getSession()) syncNow(false); });
  window.addEventListener('offline', () => document.body.classList.add('is-offline'));
  document.addEventListener('click', (e) => { const d = $('#notifDrop'); if (d && d.classList.contains('show') && !d.contains(e.target)) { d.classList.remove('show'); $('#notifBtn').setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); const d = $('#notifDrop'); if (d) d.classList.remove('show'); } });
  $('#modalMain').addEventListener('hidden.bs.modal', () => { if (modalOnHide) { const f = modalOnHide; modalOnHide = null; f(); } });
  window.addEventListener('beforeunload', (e) => { if (pendingOps) { e.preventDefault(); e.returnValue = ''; } });
  // Saat lebar berubah (rotasi ponsel), gambar ulang grafik
  window.addEventListener('resize', debounce(() => { Object.values(S.charts).forEach((c) => c.resize()); }, 200));
}

function init() {
  if (!Api.configured()) { Auth.show(); return; }
  const ses = Api.getSession();
  if (!ses) { Auth.show(); return; }
  const cached = ls.get('boot_' + ses.email, null);
  if (cached && cached.ok) {
    // Tampil instan dari cache, lalu segarkan di latar
    startWithBoot(cached, false);
    setSync(`<span class="spin" style="width:12px;height:12px"></span> Memperbarui…`);
    if (cached.today !== nowJakarta().date) {
      run('getInitialData').then((b) => { S.tanggal = ''; applyBoot(b); cacheBoot(b); refreshView(); }).catch(() => { /* sudah ditangani run() */ });
    } else syncNow(false);
    return;
  }
  // Belum ada cache: ambil data awal (splash tetap tampil)
  run('getInitialData').then((b) => startWithBoot(b, false)).catch((e) => Auth.show(e.message));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
