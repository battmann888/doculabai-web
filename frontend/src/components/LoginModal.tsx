import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { supabase, authUserToProfile } from '@/utils/supabase';

export interface MockUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  birthDate?: string;
  profileCompleted?: boolean;
}

interface LoginModalProps {
  onClose: () => void;
  onSuccess: (user: MockUser) => void;
}

export function LoginModal({ onClose, onSuccess }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setError('Konfigurasi Supabase belum tersedia.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    const result = isSignUp
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: displayName, birth_date: birthDate, profile_completed: true } } })
      : await supabase.auth.signInWithPassword({ email, password });
    const { data, error: authError } = result;
    setIsSubmitting(false);
    if (authError || !data.user) {
      setError(authError?.message || (isSignUp ? 'Akun tidak dapat dibuat.' : 'Email atau password tidak valid.'));
      return;
    }
    if (isSignUp && !data.session) {
      setError('Akun dibuat. Cek email Anda untuk konfirmasi sebelum masuk.');
      return;
    }
    onSuccess(authUserToProfile(data.user));
  };

  const continueWith = async (provider: 'google' | 'azure') => {
    if (!supabase) {
      setError('Konfigurasi Supabase belum tersedia.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
        queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
      },
    });
    if (authError) {
      setIsSubmitting(false);
      setError(authError.message);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-modal animate-scale-in" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close login">
          <X className="h-4 w-4" />
        </button>
        <span className="modal-kicker">PRIVATE WORKSPACE</span>
        <h2 id="login-title">Masuk untuk memproses dokumen Anda</h2>
        <p className="auth-modal__copy">Simpan pekerjaan Anda dan lanjutkan dari perangkat mana pun.</p>
        <div className="oauth-row">
          <button type="button" className="oauth-button" onClick={() => void continueWith('google')} disabled={isSubmitting}><GoogleIcon />Lanjutkan dengan Google</button>
          <button type="button" className="oauth-button" onClick={() => void continueWith('azure')} disabled={isSubmitting}><MicrosoftIcon />Lanjutkan dengan Microsoft</button>
        </div>
        <div className="auth-divider"><span>atau email</span></div>
        <form onSubmit={submit} className="auth-form">
          {isSignUp && <label>Nama tampilan<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nama Anda" required /></label>}
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required /></label>
          {isSignUp && <label>Tanggal lahir<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} required /></label>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="modal-primary-button" disabled={isSubmitting}>{isSubmitting ? 'Memproses...' : isSignUp ? 'Buat akun' : 'Masuk ke workspace'}</button>
        </form>
        <button type="button" className="auth-switch" onClick={() => { setIsSignUp((value) => !value); setError(''); }}>{isSignUp ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Buat akun'}</button>
        <p className="auth-legal">Dengan masuk, Anda menyetujui Terms of Service dan Privacy Policy.</p>
      </section>
    </div>
  );
}

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="oauth-icon"><path fill="#4285F4" d="M21.8 12.23c0-.69-.06-1.35-.18-1.98H12v3.75h5.5a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.04-4.4 3.04-7.41Z"/><path fill="#34A853" d="M12 22c2.76 0 5.08-.91 6.77-2.46l-3.3-2.56c-.91.61-2.07.97-3.47.97-2.67 0-4.93-1.8-5.74-4.22H2.85v2.64A10.22 10.22 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.26 13.73A6.14 6.14 0 0 1 5.94 12c0-.6.1-1.19.32-1.73V7.63H2.85A10.04 10.04 0 0 0 1.78 12c0 1.62.39 3.15 1.07 4.37l3.41-2.64Z"/><path fill="#EA4335" d="M12 6.05c1.5 0 2.85.52 3.91 1.54l2.93-2.93C17.07 2.99 14.76 2 12 2a10.22 10.22 0 0 0-9.15 5.63l3.41 2.64C7.07 7.85 9.33 6.05 12 6.05Z"/></svg>;
}

function MicrosoftIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="oauth-icon"><path fill="#f35325" d="M2 2h9.5v9.5H2z"/><path fill="#81bc06" d="M12.5 2H22v9.5h-9.5z"/><path fill="#05a6f0" d="M2 12.5h9.5V22H2z"/><path fill="#ffba08" d="M12.5 12.5H22V22h-9.5z"/></svg>;
}
