import { ChevronDown, ChevronRight, FileText, HelpCircle, LogOut, MessageCircle, Settings, X } from 'lucide-react';
import { useState } from 'react';
import type { MockUser } from './LoginModal';

interface DashboardSidebarProps {
  open: boolean;
  user: MockUser;
  usageCount: number;
  onClose: () => void;
  onUpload: () => void;
  onLogout: () => void;
  onProfileSettings: () => void;
  onHistorySelect?: (item: DocumentHistoryItem) => void;
  history: DocumentHistoryItem[];
}

export interface DocumentHistoryItem {
  id: string;
  name: string;
  meta: string;
}

export function DashboardSidebar({ open, user, usageCount, onClose, onUpload, onLogout, onProfileSettings, onHistorySelect, history }: DashboardSidebarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const used = Math.min(usageCount, 5);

  return (
    <>
      <div className={`sidebar-scrim ${open ? 'sidebar-scrim--visible' : ''}`} onClick={onClose} />
      <aside className={`dashboard-sidebar ${open ? 'dashboard-sidebar--open' : ''}`} aria-hidden={!open}>
        <header className="dashboard-sidebar__header"><div><span className="modal-kicker">DOCULABAI</span><h2>Dashboard</h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="Close dashboard"><X className="h-4 w-4" /></button></header>
        <button type="button" className="sidebar-upload-button" onClick={onUpload}><span>Upload Dokumen Baru</span><ChevronRight className="h-4 w-4" /></button>
        <div className="sidebar-section"><span className="sidebar-label">DOCUMENT HISTORY</span>{history.length > 0 ? history.map((item) => <button type="button" className="history-item" key={item.id} onClick={() => onHistorySelect?.(item)}><FileText className="h-4 w-4" /><span><strong>{item.name}</strong><small>{item.meta}</small></span></button>) : <div className="history-empty"><FileText className="h-4 w-4" /><span>Belum ada dokumen</span></div>}</div>
        <div className="sidebar-section sidebar-help"><span className="sidebar-label">SUPPORT</span><button type="button" className="sidebar-link" onClick={() => setHelpOpen((value) => !value)}><HelpCircle className="h-4 w-4" />FAQ<ChevronDown className={`ml-auto h-4 w-4 transition-transform ${helpOpen ? 'rotate-180' : ''}`} /></button>{helpOpen && <div className="sidebar-help__answer">Bagaimana cara menjaga layout? Setiap edit hanya mengubah bagian yang diminta dan mempertahankan struktur dokumen.</div>}<button type="button" className="sidebar-link"><MessageCircle className="h-4 w-4" />Bantuan & Dukungan</button></div>
        <div className="sidebar-spacer" />
        <div className="usage-card"><div className="usage-card__label"><span>FREE AI EDITS</span><strong>{used}/5</strong></div><div className="usage-bar"><span style={{ width: `${(used / 5) * 100}%` }} /></div><small>{used >= 5 ? 'Limit tercapai' : `${5 - used} edit tersisa hari ini`}</small></div>
        <div className="profile-wrap"><button type="button" className="profile-card" onClick={() => setProfileOpen((value) => !value)}><img src={user.avatar} alt="" /><span><strong>{user.name}</strong><small>{user.email}</small></span><ChevronDown className={`ml-auto h-4 w-4 transition-transform ${profileOpen ? 'rotate-180' : ''}`} /></button>{profileOpen && <div className="profile-menu"><button type="button" onClick={onProfileSettings}><Settings className="h-4 w-4" />Pengaturan Akun</button><button type="button" onClick={onLogout}><LogOut className="h-4 w-4" />Keluar</button></div>}</div>
      </aside>
    </>
  );
}
