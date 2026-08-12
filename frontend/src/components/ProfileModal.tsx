import { useEffect, useState } from 'react';
import { Check, LogOut, X } from 'lucide-react';
import type { MockUser } from './LoginModal';
import { ABSTRACT_AVATARS } from '@/utils/avatars';

export type AppTheme = 'dark' | 'light' | 'system';

interface ProfileModalProps {
  user: MockUser;
  theme: AppTheme;
  onClose: () => void;
  onSave: (user: MockUser, theme: AppTheme, birthDate: string) => void;
  onLogout: () => void;
}

export function ProfileModal({ user, theme, onClose, onSave, onLogout }: ProfileModalProps) {
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar || ABSTRACT_AVATARS[0]);
  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(theme);
  const [birthDate, setBirthDate] = useState(user.birthDate || '');

  useEffect(() => {
    setName(user.name);
    setAvatar(user.avatar || ABSTRACT_AVATARS[0]);
    setBirthDate(user.birthDate || '');
  }, [user]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="profile-modal animate-scale-in" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close profile"><X className="h-4 w-4" /></button>
        <div className="profile-hero"><img src={avatar} alt="Foto profil" /><div><span className="modal-kicker">PROFILE</span><h2 id="profile-title">Profil pengguna</h2></div></div>
        <p className="profile-modal__email">{user.email}</p>
        <label className="profile-field">Nama tampilan<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama Anda" /></label>
        <label className="profile-field">Tanggal lahir<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label>
        <div className="profile-setting"><span className="profile-setting__label">Pilih avatar</span><div className="avatar-picker">{ABSTRACT_AVATARS.map((item, index) => <button type="button" key={item} className={`avatar-option ${avatar === item ? 'avatar-option--selected' : ''}`} onClick={() => setAvatar(item)}><img src={item} alt={`Avatar abstrak ${index + 1}`} />{avatar === item && <Check className="avatar-option__check" />}</button>)}</div></div>
        <div className="profile-setting"><span className="profile-setting__label">Tampilan aplikasi</span><div className="theme-picker">{(['dark', 'light', 'system'] as AppTheme[]).map((item) => <button type="button" key={item} className={selectedTheme === item ? 'theme-option theme-option--selected' : 'theme-option'} onClick={() => setSelectedTheme(item)}>{item === 'dark' ? 'Dark' : item === 'light' ? 'White' : 'System'}</button>)}</div></div>
        <button type="button" className="modal-primary-button profile-save" onClick={() => onSave({ ...user, name: name.trim() || user.name, avatar }, selectedTheme, birthDate)}>Simpan profil</button>
        <button type="button" className="profile-logout-button" onClick={onLogout}><LogOut className="h-4 w-4" />Keluar dari akun</button>
      </section>
    </div>
  );
}
