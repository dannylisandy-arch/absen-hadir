// 1. Firebase Console > Project settings > General > "Your apps" > Web app > SDK setup and configuration.
//    Salin isi firebaseConfig ke sini.
export const firebaseConfig = {
  apiKey: "AIzaSyAqlICu_EZ0k2bVY7xwvPvx_kSec7-dT1M",
  authDomain: "absencsm.firebaseapp.com",
  projectId: "absencsm",
  storageBucket: "absencsm.firebasestorage.app",
  messagingSenderId: "479281475998",
  appId: "1:479281475998:web:c538ac153294a2ace4e68f"
};

// 2. Firebase Console > Project settings > Cloud Messaging > Web Push certificates > Generate key pair.
export const VAPID_KEY = "BATrISowC6zpK5WU0_jBHSqcfs7Af_rEXWEwfTug7lfsgVP_QOXnxFa3yFr0wbOqtHQM9VHU57hPgTU6migmX58";

// 3. Login memakai username. Username diubah menjadi "username@USERNAME_DOMAIN" di Firebase Auth
//    (tidak ada email yang dikirim). JANGAN diubah setelah ada pengguna yang mendaftar.
export const USERNAME_DOMAIN = "absensi.local";

// 4. (Opsional) API key Google Maps untuk alamat yang lebih tepat. Kosongkan untuk memakai OpenStreetMap.
//    Batasi key ke situs https://absencsm.pages.dev/* dan API: Maps JavaScript API + Geocoding API.
export const GOOGLE_MAPS_KEY = "AIzaSyBcdIPXF4MtsdH0djMRVONxJkDjLwyOFS8";

// 5. (Opsional, disarankan) Firebase App Check: isi dengan "site key" reCAPTCHA Enterprise.
//    Kosongkan = App Check tidak dipakai (aplikasi tetap berjalan normal).
export const APPCHECK_SITE_KEY = "6LdRrPQtAAAAAKZHcd_WVWeIMkhGgDrCRqn7sqHj";   // reCAPTCHA Enterprise "absensi-web"
