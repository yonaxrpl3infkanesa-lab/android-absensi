# TestAbsensi

Project React Native untuk login siswa dengan `NISN + password`, ambil foto absensi dari kamera, simpan foto dan riwayat absensi ke Firebase, lalu sinkron realtime antar device.

## Fitur yang sudah dipasang

- Login berdasarkan dokumen siswa di Firestore.
- Session login lokal menggunakan AsyncStorage.
- Ambil foto absensi memakai kamera Android.
- Upload foto ke Firebase Storage.
- Simpan riwayat absensi persisten di Firestore.
- Listener realtime untuk riwayat agar device lain ikut ter-update.
- Error handling untuk login, izin kamera, koneksi, dan kegagalan sinkronisasi.
- Migrasi otomatis ke dokumen kanonis `students/{nisn}` jika sebelumnya data siswa tersimpan dengan document ID lain.

## Struktur Firebase yang dipakai

Collection `students`

Gunakan document ID yang sama dengan `NISN`, yaitu `students/{nisn}`.

Contoh dokumen `students/{nisn}`:

```json
{
  "nisn": "0098331428",
  "name": "Budi Santoso",
  "password": "yoni123",
  "className": "12 IPA 1",
  "schoolName": "SMK Contoh",
  "studentDocId": "0098331428",
  "lastAttendanceId": "auto_doc_id",
  "lastAttendanceAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

Subcollection `students/{nisn}/attendance`

Contoh dokumen `students/{nisn}/attendance/{attendanceId}`:

```json
{
  "id": "auto_doc_id",
  "nisn": "0098331428",
  "studentName": "Budi Santoso",
  "className": "12 IPA 1",
  "status": "hadir",
  "note": "Hadir",
  "photoUrl": "https://...",
  "photoPath": "attendancePhotos/0098331428/auto_doc_id.jpg",
  "photoFileName": "auto_doc_id.jpg",
  "photoMimeType": "image/jpeg",
  "photoWidth": 1280,
  "photoHeight": 720,
  "photoSize": 245678,
  "deviceTimestamp": "2026-04-30T08:10:00.000Z",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

Storage path:

```txt
attendancePhotos/{nisn}/{attendanceId}.jpg
```

## Setup Firebase

1. Buat project Firebase.
2. Aktifkan Firestore dan Firebase Storage.
3. Download `google-services.json` dari Firebase Console.
4. Simpan file itu ke `android/app/google-services.json`.
5. Jika nanti build iOS, download juga `GoogleService-Info.plist` dan masukkan ke project Xcode.
6. Buat collection `students` lalu isi minimal field `nisn`, `name`, dan `password`.
7. Jika ada data lama dengan document ID selain `NISN`, aplikasi akan menyalin data siswa dan riwayat ke `students/{nisn}` saat login pertama setelah update ini.

## Contoh aturan dasar Firebase

Gunakan ini sebagai titik awal, lalu sesuaikan kebutuhan produksi:

Firestore rules:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /students/{nisn} {
      allow read, write: if true;

      match /attendance/{attendanceId} {
        allow read, write: if true;
      }
    }
  }
}
```

Storage rules:

```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /attendancePhotos/{nisn}/{fileName} {
      allow read, write: if true;
    }
  }
}
```

Catatan: rules di atas hanya untuk testing awal. Untuk production, ganti dengan rule berbasis autentikasi dan otorisasi yang lebih ketat.

## Testing manual

1. Jalankan Metro: `npm start`
2. Jalankan app Android: `npm run android`
3. Login dengan `NISN` dan `password` yang memang ada pada dokumen Firestore `students/{nisn}`.
4. Tekan `Absen dengan Kamera`.
5. Pastikan kamera terbuka, foto bisa diambil, dan muncul alert sukses.
6. Cek Firestore: dokumen attendance baru harus muncul di `students/{nisn}/attendance`.
7. Cek Storage: file foto harus muncul di `attendancePhotos/{nisn}/`.
8. Logout.
9. Login ulang dengan NISN yang sama.
10. Pastikan riwayat absensi lama tetap tampil.
11. Buka app di device lain, login dengan NISN yang sama.
12. Pastikan data riwayat yang tampil sama dan update realtime saat device pertama menambah absensi baru.

## Build APK release

1. Pastikan `android/app/google-services.json` sudah ada.
2. Pastikan data Firebase sudah benar.
3. Jalankan:

```bash
cd android
./gradlew assembleRelease
```

4. Hasil APK release akan berada di:

```txt
android/app/build/outputs/apk/release/app-release.apk
```

## Catatan penting

- Build release akan gagal jika `google-services.json` belum ditambahkan.
- Login saat ini membaca password langsung dari Firestore agar cocok dengan kebutuhan `NISN + password` yang Anda minta.
- Untuk keamanan production, sangat disarankan mengganti penyimpanan password plaintext menjadi hash atau Firebase Authentication kustom.
