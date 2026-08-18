# 🧠 DoculabAI — Copilot Lo Buat Ngurusin Dokumen DOCX

> **🚀 Langsung cobain aja di [doculabai.my.id](https://doculabai.my.id)** — tinggal drop file `.docx`, terus ngobrol sama AI buat ngubah isinya. Serius, semudah itu. Ga perlu install apa-apa, ga perlu daftar ribet, langsung gas!

![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_AI-3.5-8E75B2?style=for-the-badge&logo=google&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Supabase](https://img.shields.io/badge/Auth-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

---

## ☕ Apaan Sih Aplikasi Ini?

Bayangin lo lagi pegang dokumen Word yang udah beres rapi — layoutnya kece, tabelnya pas, gambarnya nempel di tempatnya. Terus lo mikir, _"duh, gue pengen ganti kalimat ini tapi males banget buka Word dan ngutak-ngatik manual"_.

Nah, **DoculabAI** hadir buat nyelesain drama itu. 🎯

Aplikasi ini pada dasarnya adalah **copilot lo buat ngurusin dokumen DOCX**. Lo tinggal:

1. **Drop file `.docx`** — langsung ke-render cantik di browser, persis kayak di Word.
2. **Ngobrol sama AI** — bilang aja mau diapain. _"Ganti judulnya jadi lebih formal"_, _"rapiin tabelnya"_, _"ubah font paragraf kedua"_, apapun itu.
3. **Gas!** — AI bikin rencana edit, lo approve, dan dokumen langsung berubah. **Layout-nya dijamin aman** — tabel, gambar, heading, semua tetep di posisinya. Yang berubah cuma isinya.

Dan yang paling gokil: **lo ga perlu nyimpen file di server**. Semuanya diproses di memori, langsung dihajar, selesai. Nggak ada file fisik yang numpuk di mana-mana. Bersih, cepet, dan hemat. ✨

---

## 🧠 Fitur-Fitur Andalan

| Fitur                              | Ceritanya                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 📄 **Render DOCX Fidelity Tinggi** | Dokumen lo tampil persis kayak di Word — font, tabel, gambar, heading, semua dipertahankan. Bukan sekadar teks mentah. |
| 💬 **Chat dengan AI**              | Ngobrol natural buat minta perubahan. AI ngerti konteks dokumen lo, bukan cuma keyword matching.                       |
| 🎨 **Edit Aman & Presisi**         | AI bikin rencana edit dulu, lo yang pegang kendali. Layout dokumen dijamin ga berantakan.                              |
| 📱 **Seamless Hybrid UI**          | Buka di HP? Santai. Layout otomatis nyesuain, ada tombol asisten AI (FAB) yang siap nemenin lo ngedit di layar kecil.  |
| 🔄 **Undo / Revert**               | Salah edit? Tinggal revert, balik kayak semula. Ga ada drama.                                                          |
| 👤 **Akun & Riwayat**              | Login pake Supabase, riwayat dokumen lo kesimpen rapi.                                                                 |

---

## ⚙️ "Dapur" Teknologinya (Engineering Highlights)

### 🧊 Stateless In-Memory — Ga Nyimpen File Fisik

Ini bagian yang paling keren menurut gue. Backend kita itu **stateless** — artinya kita **ga butuh nyimpen file fisik di disk**.

Gimana caranya? Jadi gini:

- Lo upload `.docx` → file langsung dibaca dan dipecah jadi **segmen-segmen** (paragraf, tabel, gambar, dll) di dalam **RAM**.
- Segmen-segmen ini dikirim ke AI buat dianalisis, terus hasilnya balik ke frontend.
- **Selesai.** File aslinya ga pernah disimpen permanen di server.

Karena semuanya jalan di **memori (RAM) di atas awan (Vercel Serverless)**, prosesnya jadi **instan dan ngebut banget**. Ga ada bottleneck baca-tulis disk, ga ada file yang numpuk, ga ada storage yang penuh. Ini juga bikin aplikasi kita **super hemat biaya** — karena serverless cuma bayar pas dipake, dan kita ga perlu nyewa storage mahal.

Plus, karena stateless, **scale otomatis** — kalau tiba-tiba 1000 orang upload barengan, Vercel tinggal nambah instance. Ga pusing mikirin sinkronisasi file antar server. 🚀

### 📱 Seamless Hybrid UI — Enak Dibuka di Mana Aja

Pernah buka website di HP terus layoutnya berantakan? Nah, itu yang kita hindarin banget.

DoculabAI punya sistem **view mode otomatis** yang nyesuain tampilan dokumen:

- **Desktop View** — dokumen tampil dengan ukuran asli (A4), bisa di-scroll bebas. Buat yang lagi di depan laptop, ini default-nya.
- **Mobile View** — seluruh kanvas dokumen **di-zoom out secara proporsional** biar muat di layar HP. Layoutnya tetep rapi persis kayak di desktop, cuma ukurannya yang mengecil. Mata lo ga bakal sakit. 😌

Dan yang paling kece: ada **Floating Action Button (FAB)** asisten AI yang muncul di layar kecil. Jadi pas lo lagi baca dokumen di HP dan tiba-tiba pengen ngedit, tinggal tap tombol itu, drawer AI kebuka, langsung ngobrol. Ga perlu scroll ke atas, ga perlu cari-cari tombol. **Semua ada di ujung jari lo.** 👆

---

## 🏗️ Arsitektur Proyek

```
.
├── frontend/                  # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/        # UI components (DocumentViewer, ChatPanel, dll)
│   │   ├── utils/             # docxProcessor, api client, supabase
│   │   ├── types.ts           # Shared types
│   │   ├── App.tsx            # Main app
│   │   └── index.css          # Theme & styling
│   ├── api/                   # Serverless API entry (Vercel)
│   ├── vercel.json            # Vercel config
│   └── package.json
│
├── backend/                   # FastAPI + Gemini AI
│   ├── app/
│   │   ├── api/               # Endpoints (upload, plan, chat)
│   │   ├── services/          # Parser, editor, AI planner, exporter
│   │   ├── models/            # Pydantic models
│   │   ├── utils/             # Error handling
│   │   ├── config.py          # Settings & env config
│   │   └── main.py            # App entry
│   ├── tests/                 # Unit tests
│   └── requirements.txt
│
└── README.md                  # Lo lagi baca ini 😄
```

---

## 🚀 Cara Ngulik di Lokal (Getting Started)

Pengen nyobain di laptop sendiri? Gampang banget, tinggal ikutin langkah-langkah ini:

### Prasyarat

- **Node.js** 18+ (buat frontend)
- **Python** 3.10+ (buat backend)
- **Gemini API Key** — gratis kok, ambil di [Google AI Studio](https://aistudio.google.com/apikey)

### Langkah 1: Clone Repo

```bash
git clone https://github.com/battmann888/doculabai-web.git
cd doculabai-web
```

### Langkah 2: Setup Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt

# Setup env
cp .env.example .env
# Edit .env, isi GEMINI_API_KEY dengan key lo

# Jalanin server
uvicorn app.main:app --reload --port 8000
```

Backend jalan di `http://localhost:8000`. Cek kesehatan: `http://localhost:8000/api/health`.

### Langkah 3: Setup Frontend

```bash
cd frontend
npm install

# Setup env (opsional, buat auth & API URL)
cp .env.example .env

# Jalanin dev server
npm run dev
```

Frontend jalan di `http://localhost:5173`. Buka di browser, drop file `.docx`, dan mulai ngobrol sama AI! 🎉

### Langkah 4: (Opsional) Setup Supabase

Buat akun di [Supabase](https://supabase.com), bikin project baru, terus isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` di `frontend/.env`. Tanpa ini, fitur login & riwayat ga aktif, tapi fitur utama (upload + edit AI) tetep jalan.

---

## 🧪 Testing

```bash
cd backend
pytest
```

---

## 🛠️ Tech Stack

| Layer              | Teknologi                            | Kenapa?                                                    |
| ------------------ | ------------------------------------ | ---------------------------------------------------------- |
| **Frontend**       | React 19 + TypeScript + Vite         | Cepet, type-safe, developer experience-nya juara           |
| **DOCX Rendering** | `docx-preview` + `mammoth` + `jszip` | Render DOCX fidelity tinggi langsung di browser            |
| **Backend**        | FastAPI + Uvicorn                    | Ringan, async, auto-docs (Swagger) gratis                  |
| **AI**             | Google Gemini (via `google-genai`)   | Model canggih, API simpel, cocok buat parsing & planning   |
| **Auth**           | Supabase                             | Auth + database gratis, setup-nya 5 menit                  |
| **Deploy**         | Vercel (Serverless)                  | Auto-deploy dari GitHub, scale otomatis, gratis buat hobby |

---

## 📜 Lisensi

MIT — bebas dipake, dimodif, disebarin. Yang penting jangan lupa kasih credit. 😉

---

_Dibuat dengan ☕, 🎧, dan banyak banget debugging di jam 2 pagi._
