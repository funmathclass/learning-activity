# LEARNING ACTIVITY v2 — Panduan Lengkap (GAS API + GitHub Pages, login Gmail)

Panduan ini untuk pemasangan **tanpa akun Google Workspace sekolah (sch.id)**. Siapa pun yang punya Gmail dan **didaftarkan Admin** di aplikasi bisa masuk. Ditulis untuk pemula: ikuti urutannya, satu langkah demi satu langkah.

---

## 0. Gambaran besar

```
PENGGUNA (Gmail) ──► GitHub Pages (tampilan)  ──fetch──►  Apps Script (server/API)  ──►  Google Sheets + Drive + Gmail
                     https://USERNAME.github.io/REPO/       https://script.google.com/macros/s/…/exec
                     index.html · css/ · js/                Kode.gs
        Login: tombol "Sign in with Google" → server memverifikasi → token sesi 12 jam
```

- **Satu database saja**: spreadsheet yang sama dengan yang dibuat saat Anda menjalankan `setupAppEnvironment`. Data contoh/pengguna yang sudah ada **tidak hilang**.
- Yang boleh login = email yang terdaftar di sheet **Pengguna** (dan aktif). Email lain ditolak.
- Biaya: gratis (GitHub Pages + Apps Script + Google Cloud OAuth).

### Berkas yang Anda terima

| Berkas | Dipakai untuk |
|---|---|
| `Kode.gs` | Disalin-tempel ke editor Apps Script (backend) |
| `appsscript.json` | Disalin-tempel ke editor Apps Script (manifest) |
| `learning-activity.zip` | Diekstrak → **isi folder inilah yang di-push ke GitHub** |
| `PANDUAN-INSTALASI.md` | Panduan ini |

### Urutan pengerjaan (jangan dibalik)

**A. Backend Apps Script → B. OAuth Client ID → C. Isi `config.js` → D. GitHub Pages → E. Daftarkan origin → F. Uji → G. Isi data sekolah**

Siapkan Notepad untuk menyimpan 3 nilai yang akan Anda dapat: **URL `/exec`**, **Client ID**, dan **username GitHub**.

---

## A. Backend — Google Apps Script

### A1. Anda sudah memasang versi "full GAS" sebelumnya? (kasus Anda)

Pakai **proyek Apps Script yang sama** supaya data tetap ada.

1. Buka https://script.google.com → proyek **LEARNING ACTIVITY**.
2. Berkas **`Kode`** → hapus semua isi → tempel seluruh isi `Kode.gs` yang baru.
3. Klik ⚙ **Project Settings** → pastikan **Show "appsscript.json" manifest file in editor** tercentang → buka `appsscript.json` → hapus isi → tempel isi `appsscript.json` yang baru.
4. **Hapus** tiga berkas lama: `Index`, `Stylesheet`, `JavaScript` (klik titik tiga di samping nama berkas → Delete). Versi baru tidak memakainya.
5. Klik 💾 **Save**.
6. Lanjut ke **A3**.

> Belum pernah memasang apa pun? Buat **Proyek baru** bernama `LEARNING ACTIVITY API`, ubah `Code.gs` menjadi `Kode`, tempel isinya, aktifkan manifest, tempel `appsscript.json`, lalu lanjut ke A3.

### A2. (Pasang baru saja) — lewati jika memakai A1

Sama seperti A1 langkah 2–3, tanpa menghapus apa pun.

### A3. Jalankan `setupAppEnvironment`

1. Di dropdown fungsi (atas editor) pilih **`setupAppEnvironment`** → klik **▶ Run**.
2. Muncul **Authorization required** → **Review permissions** → pilih akun Gmail Anda → **Advanced** → **Go to … (unsafe)** → **Allow**.
   - Ada izin baru dibanding versi lama (**layanan eksternal**), jadi Anda akan diminta izin lagi. Ini normal.
3. Tunggu sampai log berisi "selesai". Fungsi ini aman dijalankan ulang (tidak menggandakan data) dan membuat kunci rahasia sesi (`SESSION_SECRET`) di Script Properties.

### A4. Buat deployment BARU (penting)

> **Jangan** meng-edit deployment lama. Setiap deployment membekukan versi kodenya. Deployment lama (versi full GAS) tetap bisa dibiarkan; yang kita pakai adalah deployment **baru**.

1. **Deploy → New deployment** → ikon ⚙ → **Web app**.
2. *Description*: `API v2`
3. *Execute as*: **Me**
4. *Who has access*: **Anyone**
5. **Deploy** → **Copy** URL yang berakhiran **`/exec`** → simpan di Notepad sebagai **URL-API**.

> **Kenapa "Anyone"?** Permintaan dari GitHub Pages tidak membawa sesi Google, jadi server harus bisa dihubungi. Data tetap aman: tanpa token sesi yang sah (hasil login Google + email terdaftar) server hanya menjawab `ping`.

### A5. Tes cepat

Buka di peramban: `URL-API?action=ping`
Harus muncul JSON dengan `"success":true`. Nilai `"ready"` masih `false` sampai tahap B selesai — itu normal.

---

## B. OAuth Client ID (untuk tombol "Sign in with Google")

Ini yang membuat login Gmail bekerja. Ikuti persis.

### B1. Buka Google Cloud Console
https://console.cloud.google.com → login dengan Gmail yang sama.
Bila baru pertama kali: setujui syarat → **Select a project → New project** → nama `learning-activity` → **Create**, lalu pastikan proyek itu terpilih di bar atas.

### B2. OAuth consent screen
Menu ☰ → **APIs & Services → OAuth consent screen** (di tampilan baru: **Google Auth Platform → Branding / Audience**).
1. **User type: External** → Create / Get started.
2. Isi: *App name* `Learning Activity`, *User support email* = Gmail Anda, *Developer contact* = Gmail Anda. Simpan.
3. **Audience / Publishing status → Publish app (In production)**.
   - Aplikasi ini hanya meminta data dasar (email & profil), sehingga **tidak perlu verifikasi Google**.
   - Jika dibiarkan "Testing", hanya akun yang Anda masukkan sebagai *Test users* yang bisa login. Lebih praktis: **Publish**.

### B3. Buat Client ID
1. **APIs & Services → Credentials → + Create credentials → OAuth client ID**.
2. *Application type*: **Web application**. Nama bebas (`Learning Activity Web`).
3. **Authorized JavaScript origins → + Add URI** → isi **sementara**: `https://USERNAME.github.io`
   (ganti `USERNAME` dengan username GitHub Anda; **tanpa** `/nama-repo`, **tanpa** garis miring di akhir).
   Jika username belum ada, kosongkan dulu dan tambahkan di **tahap E**.
4. **Create** → salin **Client ID** (`123…-abc.apps.googleusercontent.com`) ke Notepad. *Client secret* tidak dipakai.

### B4. Simpan Client ID ke server
Apps Script → ⚙ **Project Settings** → gulir ke **Script Properties** → **Add script property**:
- Property: `GOOGLE_CLIENT_ID`
- Value: Client ID tadi → **Save script properties**.

Buka lagi `URL-API?action=ping` → sekarang harus `"ready":true`.

> Client ID bukan rahasia (memang tampil di halaman login). Rahasia sesungguhnya (`SESSION_SECRET`, ID spreadsheet) hanya ada di Script Properties.

---

## C. Isi `js/config.js` (SEBELUM push ke GitHub)

1. Ekstrak `learning-activity.zip` ke, misalnya, `Documents\learning-activity`.
2. Buka `js\config.js` dengan Notepad atau VS Code. Ganti dua nilai:

```js
GAS_URL: 'https://script.google.com/macros/s/AKfy…/exec',       // URL-API dari A4
GOOGLE_CLIENT_ID: '123…-abc.apps.googleusercontent.com',         // Client ID dari B3
```

3. Simpan (**Ctrl+S**). Pastikan tanda kutip `'…'` dan koma tetap ada.

---

## D. Frontend — GitHub Pages (lewat terminal)

> **Jangan** memakai "Add file → Upload files" di web GitHub. Struktur folder `css/` dan `js/` akan rusak (CSS/JS 404). Selalu lewat terminal seperti di bawah.

Istilah singkat: **repository** = folder proyek di GitHub · **commit** = simpan perubahan dengan catatan · **push** = kirim ke GitHub.

### D1. Pasang Git
- **Windows**: https://git-scm.com/download/win → install dengan pengaturan bawaan (Next terus).
- **Mac**: buka Terminal, ketik `git --version`; bila belum ada, macOS menawarkan pemasangan.
- Buka **PowerShell** (Windows) lalu cek:
  ```
  git --version
  ```
  Harus muncul angka versi (mis. `git version 2.4x`).

### D2. Akun GitHub
Daftar di https://github.com. **Username** menjadi bagian alamat situs: `USERNAME.github.io` — pilih dengan sadar.

### D3. Identitas Git (sekali per komputer)
```
git config --global user.name "Nama Anda"
git config --global user.email "email-akun-github@contoh.com"
```
`user.name` bebas (bukan username GitHub). Email sebaiknya sama dengan email akun GitHub.

### D4. Buat repository
github.com → tombol **+** (kanan atas) → **New repository**:
- *Repository name*: `learning-activity` (boleh nama lain, catat)
- **Public** (wajib untuk Pages gratis — aman, frontend tidak berisi kata sandi)
- **Jangan** centang README / .gitignore / license
- **Create repository**. Biarkan halamannya terbuka.

### D5. Masuk ke folder yang BENAR (langkah paling sering salah)

Folder yang di-`git init` adalah folder hasil ekstraksi ZIP yang **langsung berisi `index.html`**:

```
Documents\learning-activity\     ← ✅ jalankan git init DI SINI
├── index.html
├── README.md
├── PANDUAN-INSTALASI.md
├── css\style.css
└── js\config.js, api.js, auth.js, app.js
```

Cara cepat (Windows): buka folder itu di File Explorer → klik **address bar** → ketik `powershell` → Enter. PowerShell terbuka di folder tersebut. Lalu:
```
dir
```
Wajib terlihat: **`index.html`**, folder **`css`**, folder **`js`**.
- Jika yang terlihat hanya satu folder `learning-activity` → masuk dulu: `cd learning-activity`, lalu `dir` lagi.
- Pastikan **tidak ada** `Kode.gs` di folder ini.

### D6. Push pertama (satu per satu)

```
git init
git add .
git commit -m "Upload pertama LEARNING ACTIVITY"
git branch -M main
git remote add origin https://github.com/USERNAME/learning-activity.git
git push -u origin main
```
(Ganti `USERNAME` dan nama repo. Ada **titik** di `git add .`.)

Saat `git push` meminta login:
- **Username**: username GitHub.
- **Password**: **Personal Access Token**, bukan kata sandi akun.
- Saat paste token, layar **memang kosong** — normal. Klik kanan untuk paste, lalu **Enter**.

**Membuat token:** https://github.com/settings/tokens → *Generate new token (classic)* → Note `git-push` → Expiration `90 days` → centang **repo** → *Generate token* → salin `ghp_…` (hanya tampil sekali, simpan di Notepad).

Berhasil bila muncul `Writing objects: 100%` dan `* [new branch] main -> main`.

> Alternatif tanpa terminal: **GitHub Desktop** (https://desktop.github.com) → login → *Add Local Repository* → pilih folder → *Publish repository*.

### D7. Aktifkan GitHub Pages
Repo di github.com → **Settings** → **Pages** (sidebar kiri):
- *Source*: **Deploy from a branch**
- *Branch*: **main** · folder **/ (root)** → **Save**
- Centang **Enforce HTTPS**.

Tunggu 1–2 menit, refresh. Muncul: *"Your site is live at https://USERNAME.github.io/learning-activity/"*. Salin alamat itu.

---

## E. Daftarkan alamat situs ke Google (wajib agar tombol login muncul)

Jika di B3 Anda belum mengisi origin, atau username berbeda:
1. Cloud Console → **APIs & Services → Credentials** → klik nama Client ID Anda.
2. **Authorized JavaScript origins** → pastikan ada `https://USERNAME.github.io` (hanya domain!).
3. **Save**. Perubahan dapat memakan waktu **hingga 5 menit** untuk aktif.

---

## F. Uji

1. Buka `https://USERNAME.github.io/learning-activity/` → tekan **Ctrl+Shift+R**.
2. Halaman **Masuk ke Aplikasi** → klik **Sign in with Google** → pilih Gmail Admin (akun yang menjalankan setup).
3. Beranda muncul dengan data contoh.
4. Cek peran lain tanpa akun tambahan: **Pengguna & Peran → ikon mata (Simulasi)**.
5. Tes dari ponsel: buka alamat yang sama, login dengan Gmail yang terdaftar.

---

## G. Mulai dipakai sungguhan

1. **Pengaturan Sekolah**: nama sekolah, logo, kontak admin, term/tahun ajaran, hari libur.
2. **Pengguna & Peran → tab 3. Unit & Term** (inilah "data master"): unit, tahun ajaran, term, hari libur, **kelas**, **jam pelajaran**, dan jenis pegawai. Angka di panel *Ringkasan Unit* pada menu Jadwal Term (jumlah kelas, jam pelajaran, staf) berasal dari data ini, **bukan** dari isi PDF jadwal.
3. **Pengguna & Peran → tab 1. Pengguna**: tambah satu per satu dengan **Tambah Pengguna**, atau banyak sekaligus dengan **Impor Excel** (lihat bagian *Impor data dari Excel* di bawah). *Email yang tidak terdaftar tidak bisa masuk.* Guru wajib memakai **persis email yang Anda daftarkan**.
4. **Jadwal Piket**: atur per hari.
5. **Pengaturan Sekolah → Hapus Data Contoh**.
6. (Opsional) **Batasi domain email** bila suatu hari sekolah memakai Workspace.
7. Bagikan link situs GitHub Pages ke guru. Sarankan **Add to Home Screen** di ponsel.

---

## Impor data dari Excel

Untuk mengisi banyak data sekaligus (puluhan guru, belasan kelas, daftar jam, hari libur).

**Letak tombol:** *Pengguna & Peran* → tab **1. Pengguna** → **Impor Excel**, atau tab **3. Unit & Term** → **Impor Excel (Kelas, Jam, Hari Libur)**.

**Langkah:**
1. Di layar Impor, pilih **Jenis data** (Pengguna / Kelas / Jam Pelajaran / Hari Libur).
2. Klik **Unduh template** → buka berkas `Template_Impor_Learning_Activity.xlsx`. Isi sheet yang sesuai (baris 1 jangan diubah). Sheet **Petunjuk** berisi nilai yang valid (kode unit, nama peran, jenis pegawai) dan contoh baris.
3. Simpan, lalu **unggah** di layar Impor (.xlsx, .xls, atau .csv; maks. 5 MB dan 1.000 baris per impor).
4. Cek **pratinjau**: tiap baris diberi status *Baru*, *Diperbarui*, atau *Dilewati* (beserta alasannya). Perbaiki di Excel lalu unggah ulang bila perlu.
5. Klik **Impor N baris**. Hanya baris yang valid yang disimpan.

**Aturan penting:**
- Impor **menambah** data baru dan **memperbarui** data yang sama; **tidak pernah menghapus**.
- Pengguna dikenali dari **email**, kelas dari **unit + nama kelas**, jam dari **unit + jam ke-**, hari libur dari **tanggal + unit**.
- Kolom boleh berbeda urutan, dan beberapa nama judul alternatif dikenali (mis. *Role* untuk Peran). Baris judul boleh tidak di baris 1.
- Format: jam `07:30`; tanggal `2026-12-25` atau `25/12/2026`; Aktif `Ya`/`Tidak` (kosong = Ya).
- Kepala Sekolah dan peran ber-cakupan unit **wajib** mengisi Unit.
- Akun Admin yang sedang dipakai tidak diubah lewat impor (supaya tidak terkunci).
- Unit pada baris Pengguna boleh ditulis kodenya (`HS`) atau nama lengkapnya (`High School`).
- Mengimpor ulang berkas yang sama aman: data tidak menjadi ganda.

> Pustaka pembaca Excel dimuat dari internet saat layar Impor dibuka, jadi diperlukan koneksi internet.

---

## Jadwal Mengajar (impor dari jadwal pelajaran sekolah)

Fitur ini membaca berkas jadwal pelajaran sekolah **apa adanya**, tanpa template khusus. Hasilnya dipakai untuk mengisi kelas yang ditinggalkan di form Cover Lesson secara otomatis.

**Letak tombol:** *Pengguna & Peran* → tab **6. Jadwal Mengajar** → **Impor Jadwal**.

**Berkas yang dibaca** (contoh: `Jadwal_Pelajaran_ICM_2026_2027.xlsx`):
- Sheet berisi kolom **Kelas, Hari, Jam Ke, Mata Pelajaran & Kode Guru** (mis. *Semua Jadwal (Database)*). Satu baris = satu kelas, satu hari, satu jam. Sel seperti `Math (TP)` dibaca sebagai mata pelajaran *Math*, kode guru *TP*.
- Sheet daftar guru dengan kolom **Kode** dan **Nama Guru** (mis. *Ringkasan & Info Guru*), dipakai untuk mencocokkan kode ke nama.
- Hanya baris **KBM / Jam N** yang diambil. Hand Over, Homeroom, dan Istirahat dilewati.

**Langkah:**
1. Pilih **Unit** dan **Term** tujuan, lalu unggah berkas.
2. Pratinjau menampilkan jumlah baris, kelas, dan kode guru. Kode guru yang namanya **sama** dengan pengguna terdaftar otomatis terhubung; sisanya pilih manual lewat daftar, atau biarkan *Tidak dihubungkan*.
3. Bila ada kelas atau jam pelajaran yang belum ada di Master, centang opsi untuk menambahkannya otomatis (nama kelas `7A` dan `7-A` dianggap sama).
4. Klik **Impor**. Jadwal unit dan term tersebut **diganti seluruhnya** oleh isi berkas (pratinjau memberi peringatan bila sudah ada jadwal). Jadwal unit atau term lain tidak tersentuh.

**Memakai jadwal di form Cover Lesson:** buka *Input Ketidakhadiran*, pilih guru dan rentang tanggal, lalu tekan **Isi dari Jadwal Mengajar**. Aplikasi membuat satu slot per kelas pada tiap hari kerja, dan jam berurutan untuk kelas yang sama digabung (mis. Jam 1–2). Periksa lalu lengkapi instruksi tugas. Tombol hanya muncul bila guru tersebut sudah terhubung ke jadwal.

**Catatan:**
- Kegiatan **tim** yang ditulis dengan beberapa kode (mis. `PDD 0365 (TP/AB/DP/DK)`) **tidak** diisi otomatis, karena tidak diketahui guru mana yang memegang kelas mana. Tambahkan manual lewat *Tambah Jadwal*.
- Kode guru yang tidak ada di sheet daftar guru (atau tidak dihubungkan) tetap tersimpan, tetapi belum bisa dipakai untuk pengisian otomatis. Hubungkan dengan mengimpor ulang berkas yang sama.
- Jadwal tampil per **kelas** atau per **guru** dalam grid Senin–Jumat. Guru biasa hanya menerima data jadwalnya sendiri.
- Jadwal berlaku per term. Saat term berganti, impor jadwal term baru.

---

## Memperbarui di kemudian hari

| Yang berubah | Langkah |
|---|---|
| Tampilan (`index.html`, `css/`, `js/`) | Ubah berkas di folder yang sama → PowerShell di folder itu:<br>`git add .` → `git commit -m "keterangan"` → `git push`. Tunggu 1–2 menit, **Ctrl+Shift+R**. |
| Backend (`Kode.gs`) | Tempel kode baru → **Deploy → Manage deployments → ✏ Edit (deployment API v2) → Version: New version → Deploy**. URL `/exec` **tetap sama**, `config.js` tidak perlu diubah. |

---

## Pemecahan masalah

| Gejala | Penyebab | Solusi |
|---|---|---|
| "Konfigurasi belum lengkap" di halaman login | `js/config.js` belum diisi | Isi `GAS_URL` & `GOOGLE_CLIENT_ID`, lalu `git add .` → `commit` → `push` |
| Tombol Google tidak muncul / *"The given origin is not allowed"* | Origin belum terdaftar | Tahap **E**. Hanya `https://USERNAME.github.io` (tanpa nama repo, tanpa `/`). Tunggu ±5 menit |
| *"Client ID tidak cocok"* | Client ID di `config.js` ≠ Script Property | Samakan keduanya, push ulang bila `config.js` berubah |
| *"GOOGLE_CLIENT_ID belum diisi"* | Script Property belum dibuat | Langkah **B4** |
| *"Respons server bukan JSON"* / error CORS di Console | Deployment bukan **Anyone**, atau URL bukan `/exec`, atau Anda memakai deployment lama | Buat **New deployment** (A4) dengan akses *Anyone*; pakai URL `/exec` yang baru |
| *"Email Anda belum didaftarkan"* | Email tidak ada di sheet Pengguna / nonaktif | Admin menambahkan di **Pengguna & Peran** |
| Login Google berhasil tapi aplikasi menolak | Gmail yang dipilih berbeda dengan yang terdaftar | Pilih akun yang benar, atau daftarkan emailnya |
| Layar "Access blocked / app not verified" | Consent screen masih *Testing* | Tahap **B2**: **Publish app**, atau tambahkan email sebagai *Test user* |
| Situs 404 | `index.html` tidak di root repo (folder salah saat `git init`) | Ulangi D5–D6 dari folder yang berisi `index.html`, lalu `git push -u origin main --force` |
| Tampilan tanpa warna (CSS 404) | Struktur `css/` `js/` rusak | Pastikan `css/style.css` dan `js/*.js` ada di repo, push ulang |
| Versi lama masih tampil | Cache peramban | **Ctrl+Shift+R** atau jendela Incognito |
| `Password authentication is not supported` | GitHub butuh token | Buat Personal Access Token (D6) |
| `remote origin already exists` | Sudah pernah `git remote add` | Lewati; bila URL salah: `git remote set-url origin <url>` |
| `src refspec main does not match any` | Belum ada commit | `git add .` lalu `git commit -m "Upload pertama"` |
| `Updates were rejected…` | Repo GitHub berisi berkas yang tidak ada di lokal | `git pull --rebase origin main` lalu `git push` |
| `LF will be replaced by CRLF` | Peringatan format baris Windows | Abaikan |
| Sesi berakhir setelah 12 jam | Disengaja (keamanan) | Masuk kembali; data tetap aman |
| Error aneh lain | — | Tekan **F12 → Console**, screenshot pesan merah, kirim ke pengembang |

**Keamanan & data:** data terakhir disimpan di perangkat (localStorage) agar aplikasi terbuka instan; data ini dihapus saat menekan **Keluar**. Di komputer bersama selalu tekan **Keluar**. Token sesi berlaku 12 jam dan ditandatangani server.

---

## Daftar periksa akhir

- [ ] `Kode.gs` & `appsscript.json` baru terpasang; berkas `Index`/`Stylesheet`/`JavaScript` lama dihapus
- [ ] `setupAppEnvironment` sukses dijalankan
- [ ] Deployment **baru**: Execute as *Me*, access *Anyone*; URL `/exec` dicatat
- [ ] OAuth consent *External* + **Published**; Client ID dibuat; origin `https://USERNAME.github.io` terdaftar
- [ ] Script Property `GOOGLE_CLIENT_ID` terisi; `?action=ping` → `"ready":true`
- [ ] `js/config.js` terisi `GAS_URL` dan `GOOGLE_CLIENT_ID`
- [ ] Repo Public; `index.html` di root; Pages aktif (main, /root) + HTTPS
- [ ] Login Admin berhasil; kelas, jam pelajaran, dan hari libur diisi (bisa lewat Impor Excel); pengguna sungguhan terdaftar; data contoh dihapus
