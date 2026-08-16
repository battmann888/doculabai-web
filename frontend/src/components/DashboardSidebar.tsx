import { ChevronDown, ChevronRight, FileText, HelpCircle, LogOut, MessageCircle, Settings, X, Search, Trash2, RotateCcw, Filter, Layers, History } from 'lucide-react';
import { useState } from 'react';
import type { MockUser } from './LoginModal';
import type { TrashItem } from '@/utils/trashStore';

interface DashboardSidebarProps {
  open: boolean;
  user: MockUser;
  usageCount: number;
  onClose: () => void;
  onUpload: () => void;
  onLogout: () => void;
  onProfileSettings: () => void;
  onOpenTemplates?: () => void;
  onOpenVersionHistory?: () => void;
  onHistorySelect?: (item: DocumentHistoryItem) => void;
  history: DocumentHistoryItem[];
  trashItems?: TrashItem[];
  onDeleteHistoryItem?: (item: DocumentHistoryItem) => void;
  onRestoreTrashItem?: (item: TrashItem) => void;
  onPermanentDeleteTrashItem?: (item: TrashItem) => void;
}
export interface DocumentHistoryItem {
  id: string;
  name: string;
  meta: string;
  savedAt?: number;
}
export function DashboardSidebar({
  open,
  user,
  usageCount,
  onClose,
  onUpload,
  onLogout,
  onProfileSettings,
  onOpenTemplates,
  onOpenVersionHistory,
  onHistorySelect,
  history,
  trashItems = [],
  onDeleteHistoryItem,
  onRestoreTrashItem,
  onPermanentDeleteTrashItem,
}: DashboardSidebarProps) {
  const [activeTab, setActiveTab] = useState<'history' | 'trash'>('history');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const used = Math.min(usageCount, 5);

  const filteredHistory = history
    .filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'oldest') {
        if (a.savedAt && b.savedAt) return a.savedAt - b.savedAt;
        return a.id.localeCompare(b.id);
      }
      if (a.savedAt && b.savedAt) return b.savedAt - a.savedAt;
      return b.id.localeCompare(a.id);
    });

  const filteredTrash = trashItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <>
      <div className={`sidebar-scrim ${open ? 'sidebar-scrim--visible' : ''}`} onClick={onClose} />
      <aside className={`dashboard-sidebar ${open ? 'dashboard-sidebar--open' : ''}`} aria-hidden={!open}>
        <header className="dashboard-sidebar__header">
          <div>
            <span className="modal-kicker">DOCULABAI</span>
            <h2>Dashboard</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dashboard">
            <X className="h-4 w-4" />
          </button>
        </header>

        <button type="button" className="sidebar-upload-button" onClick={onUpload}>
          <span>Upload Dokumen Baru</span>
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="grid grid-cols-2 gap-2 my-2">
          {onOpenTemplates && (
            <button
              type="button"
              onClick={onOpenTemplates}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/90 border border-white/10 transition-colors"
            >
              <Layers className="h-3.5 w-3.5 text-primary-400" />
              <span>Templates</span>
            </button>
          )}
          {onOpenVersionHistory && (
            <button
              type="button"
              onClick={onOpenVersionHistory}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/90 border border-white/10 transition-colors"
            >
              <History className="h-3.5 w-3.5 text-primary-400" />
              <span>Versi History</span>
            </button>
          )}
        </div>

        <div className="flex border-b border-white/10 my-3">
          <button
            type="button"
            className={`flex-1 py-2 text-xs font-semibold ${
              activeTab === 'history' ? 'text-primary-400 border-b-2 border-primary-400' : 'text-white/50'
            }`}
            onClick={() => setActiveTab('history')}
          >
            History ({history.length})
          </button>
          <button
            type="button"
            className={`flex-1 py-2 text-xs font-semibold ${
              activeTab === 'trash' ? 'text-primary-400 border-b-2 border-primary-400' : 'text-white/50'
            }`}
            onClick={() => setActiveTab('trash')}
          >
            Trash ({trashItems.length})
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3 px-1">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search docs..."
              className="w-full bg-white/5 text-xs text-white pl-8 pr-3 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-primary-500"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-white/5 text-xs text-white px-2 py-2 rounded-lg border border-white/10 focus:outline-none"
            aria-label="Sort documents"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
          </select>
        </div>

        {activeTab === 'history' ? (
          <div className="sidebar-section">
            <span className="sidebar-label">DOCUMENT HISTORY</span>
            {filteredHistory.length > 0 ? (
              filteredHistory.map((item) => (
                <div key={item.id} className="group relative flex items-center">
                  <button
                    type="button"
                    className="history-item flex-1 pr-8"
                    onClick={() => onHistorySelect?.(item)}
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.meta}</small>
                    </span>
                  </button>
                  {onDeleteHistoryItem && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteHistoryItem(item);
                      }}
                      className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-red-400 transition-opacity"
                      title="Move to Trash"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="history-empty">
                <FileText className="h-4 w-4" />
                <span>{searchQuery ? 'No matching documents' : 'No documents yet.'}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="sidebar-section">
            <span className="sidebar-label">TRASH</span>
            {filteredTrash.length > 0 ? (
              filteredTrash.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 mb-1.5">
                  <div className="truncate pr-2">
                    <strong className="text-xs text-white block truncate">{item.name}</strong>
                    <small className="text-[10px] text-white/40 block">{item.meta}</small>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onRestoreTrashItem?.(item)}
                      className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded"
                      title="Restore Document"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onPermanentDeleteTrashItem?.(item)}
                      className="p-1 text-red-400 hover:bg-red-500/20 rounded"
                      title="Permanent Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="history-empty">
                <Trash2 className="h-4 w-4" />
                <span>Your trash is empty.</span>
              </div>
            )}
          </div>
        )}

        <div className="sidebar-section sidebar-help">
          <span className="sidebar-label">SUPPORT</span>
          <button type="button" className="sidebar-link" onClick={() => setHelpOpen((value) => !value)}>
            <HelpCircle className="h-4 w-4" />
            FAQ
            <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${helpOpen ? 'rotate-180' : ''}`} />
          </button>
          {helpOpen && (
            <div className="sidebar-help__answer">
              Bagaimana cara menjaga layout? Setiap edit hanya mengubah bagian yang diminta dan mempertahankan struktur dokumen.
            </div>
          )}
          <button type="button" className="sidebar-link">
            <MessageCircle className="h-4 w-4" />
            Bantuan & Dukungan
          </button>
        </div>

        <div className="sidebar-spacer" />

        <div className="usage-card">
          <div className="usage-card__label">
            <span>FREE AI EDITS</span>
            <strong>{used}/5</strong>
          </div>
          <div className="usage-bar">
            <span style={{ width: `${(used / 5) * 100}%` }} />
          </div>
          <small>{used >= 5 ? 'Limit tercapai' : `${5 - used} edit tersisa hari ini`}</small>
        </div>

        <div className="profile-wrap">
          <button type="button" className="profile-card" onClick={() => setProfileOpen((value) => !value)}>
            <img src={user.avatar} alt="" />
            <span>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
            <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
          </button>
          {profileOpen && (
            <div className="profile-menu">
              <button type="button" onClick={onProfileSettings}>
                <Settings className="h-4 w-4" />
                Pengaturan Akun
              </button>
              <button type="button" onClick={onLogout}>
                <LogOut className="h-4 w-4" />
                Keluar
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
