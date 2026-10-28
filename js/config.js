/* ============================================================================
   LEARNING ACTIVITY — Konfigurasi Frontend
   WAJIB diisi sebelum push ke GitHub (lihat PANDUAN-INSTALASI.md).
   Kedua nilai ini memang publik (bukan rahasia): URL web app dan OAuth Client ID.
   Rahasia sesungguhnya (SESSION_SECRET, ID spreadsheet) hanya ada di Script Properties.
   ============================================================================ */
window.LA_CONFIG = {
  // URL Web App Apps Script (berakhiran /exec) — dari Deploy → Manage deployments
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzyWP7eHXHCNLHK-WKkh1DJ8EmRkh2mk6691YRbDg6EHMiS9qGngDc3G5tCa2tRs4ZM/exec',

  // OAuth 2.0 Client ID (tipe "Web application") dari Google Cloud Console
  GOOGLE_CLIENT_ID: '555786061960-7o17p65q7sajvjpkrcrck3vbc50oagme.apps.googleusercontent.com',

  // Batas waktu satu permintaan ke server (milidetik)
  TIMEOUT_MS: 60000
};
