import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ImagePlus,
  ShieldCheck,
  Sparkles,
  Table2,
  Type,
  Upload,
  Wand2,
  X,
  ChevronDown,
  LayoutTemplate,
  History,
  Download,
  CheckCircle2,
} from 'lucide-react';

import { UploadZone } from './UploadZone';

interface LandingPageProps {
  onFileSelect: (file: File) => void;
  onRequestUpload: (file?: File, openPicker?: boolean) => boolean | void;
  isLoading: boolean;
  statusMessage?: string;
  isAuthenticated: boolean;
  onRequireLogin: () => void;
}

const FEATURES = [
  {
    icon: Wand2,
    title: 'Edit dengan AI',
    copy: 'Minta AI untuk memperbaiki tata bahasa, membuat lebih formal, meringkas, atau menerjemahkan dokumen Anda secara otomatis.',
  },
  {
    icon: ImagePlus,
    title: 'Gambar → Teks',
    copy: 'Ubah gambar di dalam dokumen menjadi teks yang dapat diedit. Pilih gambar, klik "Ganti Teks", dan tulis teks penggantinya.',
  },
  {
    icon: Table2,
    title: 'Gambar → Tabel',
    copy: 'Konversi gambar menjadi tabel terstruktur. Atur jumlah baris dan kolom, lalu isi setiap sel sesuai kebutuhan.',
  },
  {
    icon: Type,
    title: 'Format Teks',
    copy: 'Ubah font, ukuran, warna, bold, italic, dan perataan paragraf dengan sekali klik. Heading style juga bisa disesuaikan.',
  },
  {
    icon: LayoutTemplate,
    title: 'Template & Tata Letak',
    copy: 'Terapkan template siap pakai, atur margin halaman, orientasi, dan ukuran kertas langsung dari workspace.',
  },
  {
    icon: History,
    title: 'Riwayat & Versi',
    copy: 'Setiap perubahan tersimpan otomatis. Tinjau, batalkan (undo), atau pulihkan versi dokumen kapan saja.',
  },
  {
    icon: Download,
    title: 'Ekspor DOCX',
    copy: 'Unduh hasil edit sebagai file DOCX yang bersih dan tetap dapat diedit, atau ekspor ke PDF untuk dibagikan.',
  },
  {
    icon: ShieldCheck,
    title: 'Privat & Aman',
    copy: 'Dokumen Anda disimpan dengan aman di workspace pribadi. Login untuk menyimpan riwayat dan melanjutkan dari perangkat mana pun.',
  },
];

const STEPS = [
  {
    icon: Upload,
    title: '1. Unggah Dokumen',
    copy: 'Seret file DOCX Anda ke area unggah atau klik untuk memilih file. Dokumen akan dibaca dan dirender otomatis.',
  },
  {
    icon: Sparkles,
    title: '2. Minta Perubahan',
    copy: 'Gunakan panel Assistant di sebelah kanan. Ketik perintah seperti "buat lebih formal" atau pilih elemen (teks/gambar) lalu gunakan tombol aksi.',
  },
  {
    icon: CheckCircle2,
    title: '3. Tinjau & Terapkan',
    copy: 'AI menampilkan pratinjau perubahan. Tinjau diff, lalu klik "Apply" untuk menerapkan atau "Discard" untuk membatalkan.',
  },
  {
    icon: Download,
    title: '4. Unduh Hasil',
    copy: 'Setelah puas, unduh dokumen sebagai DOCX atau PDF. Semua perubahan tersimpan otomatis di riwayat Anda.',
  },
];

const FAQS = [
  {
    q: 'Apakah saya perlu login untuk menggunakan aplikasi ini?',
    a: 'Ya. Login diperlukan untuk mengunggah dokumen, menyimpan riwayat, dan menggunakan fitur AI. Anda bisa login dengan Google, GitHub, atau email. Tanpa login, Anda hanya bisa melihat halaman ini.',
  },
  {
    q: 'Bagaimana cara mengubah gambar menjadi teks?',
    a: 'Klik gambar di dalam dokumen untuk memilihnya, lalu buka panel "Ubah Gambar" di Assistant. Pilih "Ganti Teks", tulis teks pengganti, atur font/ukuran jika perlu, lalu klik "Terapkan Teks".',
  },
  {
    q: 'Bagaimana cara mengubah gambar menjadi tabel?',
    a: 'Pilih gambar di dokumen, buka panel "Ubah Gambar", lalu pilih "Ganti Tabel". Atur jumlah baris dan kolom, isi setiap sel, lalu klik "Terapkan Tabel".',
  },
  {
    q: 'Format file apa yang didukung?',
    a: 'Saat ini aplikasi mendukung file DOCX. Anda dapat mengunggah, mengedit, dan mengekspor kembali sebagai DOCX, atau mengekspor ke PDF.',
  },
  {
    q: 'Apakah dokumen saya aman?',
    a: 'Ya. Dokumen Anda disimpan di workspace pribadi yang hanya bisa diakses oleh akun Anda. Kami tidak membagikan dokumen Anda kepada pihak lain.',
  },
  {
    q: 'Bisakah saya membatalkan perubahan yang sudah diterapkan?',
    a: 'Tentu. Setiap perubahan yang diterapkan dapat dibatalkan dengan tombol "Undo" pada pesan Assistant, atau melalui riwayat versi dokumen.',
  },
];

export function LandingPage({
  onFileSelect,
  onRequestUpload,
  isLoading,
  statusMessage,
  isAuthenticated,
  onRequireLogin,
}: LandingPageProps) {
  const [showTips, setShowTips] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const tipsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seen = localStorage.getItem('doculabai.tipsSeen');
    if (!seen) {
      const timer = window.setTimeout(() => setShowTips(true), 1200);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const dismissTips = useCallback(() => {
    localStorage.setItem('doculabai.tipsSeen', 'true');
    setShowTips(false);
  }, []);

  const handleUploadClick = useCallback(() => {
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    onRequestUpload(undefined, true);
  }, [isAuthenticated, onRequireLogin, onRequestUpload]);

  return (
    <main className="landing-shell">
      <div className="landing-noise" />
      <div className="landing-grid" />
      <div className="landing-orbit landing-orbit--one" />
      <div className="landing-orbit landing-orbit--two" />
      <div className="landing-beam" />

      <div className="landing-content">
        <UploadZone
          onFileSelect={onFileSelect}
          onRequestUpload={onRequestUpload}
          isLoading={isLoading}
          statusMessage={statusMessage}
        />

        <section className="landing-section animate-fade-in-up" id="features">

          <div className="landing-section__head">
            <span className="pixel-label landing-section__eyebrow">FEATURES</span>
            <h2 className="landing-section__title">Semua yang Anda butuhkan untuk dokumen yang lebih baik</h2>
            <p className="landing-section__sub">Dari edit teks berbasis AI hingga konversi gambar menjadi tabel — semuanya dalam satu workspace.</p>
          </div>
          <div className="landing-features">
            {FEATURES.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="landing-feature-card">
                <span className="landing-feature-card__icon"><Icon className="h-5 w-5" strokeWidth={1.7} /></span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section animate-fade-in-up" id="tutorial">

          <div className="landing-section__head">
            <span className="pixel-label landing-section__eyebrow">TUTORIAL</span>
            <h2 className="landing-section__title">Cara menggunakan aplikasi</h2>
            <p className="landing-section__sub">Empat langkah sederhana untuk mengedit dokumen Anda dengan bantuan AI.</p>
          </div>
          <div className="landing-steps">
            {STEPS.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="landing-step">
                <span className="landing-step__icon"><Icon className="h-5 w-5" strokeWidth={1.7} /></span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section animate-fade-in-up" id="faq">

          <div className="landing-section__head">
            <span className="pixel-label landing-section__eyebrow">FAQ</span>
            <h2 className="landing-section__title">Pertanyaan yang sering diajukan</h2>
            <p className="landing-section__sub">Temukan jawaban cepat untuk pertanyaan umum seputar aplikasi.</p>
          </div>
          <div className="landing-faq">
            {FAQS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={faq.q} className={`landing-faq__item ${isOpen ? 'landing-faq__item--open' : ''}`}>
                  <button
                    type="button"
                    className="landing-faq__question"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <ChevronDown className="landing-faq__chevron h-4 w-4" strokeWidth={2} />
                  </button>
                  {isOpen && <div className="landing-faq__answer"><p>{faq.a}</p></div>}
                </div>
              );
            })}
          </div>
        </section>

        <section className="landing-cta animate-fade-in-up">

          <h2>Siap membuat dokumen Anda lebih baik?</h2>
          <p>Unggah file DOCX Anda dan mulai edit dengan bantuan AI sekarang.</p>
          <button type="button" className="landing-cta__button" onClick={handleUploadClick}>
            <Upload className="h-4 w-4" strokeWidth={2} />
            {isAuthenticated ? 'Unggah Dokumen' : 'Login untuk Mulai'}
            <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </section>

        <footer className="landing-footer">
          <span className="pixel-label">AIDOCU &nbsp;/&nbsp; DOCUMENT INTELLIGENCE</span>
          <span className="pixel-label">PRIVATE WORKSPACE</span>
        </footer>
      </div>

      {showTips && (

        <div className="landing-tips animate-fade-in-up" ref={tipsRef} role="dialog" aria-label="Tips penggunaan">
          <div className="landing-tips__head">
            <span className="landing-tips__icon"><Sparkles className="h-4 w-4" strokeWidth={1.8} /></span>
            <span className="pixel-label">SELAMAT DATANG</span>
            <button type="button" className="landing-tips__close" onClick={dismissTips} aria-label="Tutup tips">
              <X className="h-4 w-4" />
            </button>
          </div>
          <h3>Tips cepat untuk memulai</h3>
          <ul className="landing-tips__list">
            <li><strong>Unggah DOCX</strong> untuk mulai mengedit.</li>
            <li>Pilih <strong>teks</strong> lalu minta AI mengubahnya di panel Assistant.</li>
            <li>Klik <strong>gambar</strong> untuk mengubahnya menjadi teks, tabel, atau gambar baru.</li>
            <li>Tinjau perubahan lalu klik <strong>Apply</strong> untuk menerapkannya.</li>
          </ul>
          <button type="button" className="landing-tips__dismiss" onClick={dismissTips}>Mengerti, lanjutkan</button>
        </div>
      )}
    </main>
  );
}
