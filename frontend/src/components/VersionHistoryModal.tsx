import { useState, useEffect } from 'react';
import { X, History, RotateCcw, FileText, Calendar } from 'lucide-react';
import {
  listVersionsForDocument,
  getVersionBlob,
  type DocumentVersionItem,
} from '@/utils/documentVersionStore';

interface VersionHistoryModalProps {
  userId: string;
  documentId: string;
  documentName: string;
  onClose: () => void;
  onRestoreVersion: (blob: Blob, summary: string) => void;
}

export function VersionHistoryModal({
  userId,
  documentId,
  documentName,
  onClose,
  onRestoreVersion,
}: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<DocumentVersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void listVersionsForDocument(userId, documentId).then((items) => {
      if (mounted) {
        setVersions(items);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [userId, documentId]);

  const handleRestore = async (ver: DocumentVersionItem) => {
    setRestoringId(ver.id);
    try {
      const blob = await getVersionBlob(userId, ver.id);
      if (blob) {
        onRestoreVersion(blob, `Dipulihkan ke Versi ${ver.versionNumber}`);
        onClose();
      }
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-surface-1 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary-500/10 text-primary-400">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Riwayat Versi Dokumen</h2>
              <p className="text-xs text-white/50 truncate max-w-[280px]">{documentName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Tutup modal riwayat versi"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-xs text-white/40">Memuat riwayat versi...</div>
          ) : versions.length > 0 ? (
            versions.map((ver) => (
              <div
                key={ver.id}
                className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4 hover:border-primary-500/30 transition-all"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary-500/20 text-primary-300">
                      v{ver.versionNumber}
                    </span>
                    <span className="text-xs text-white/40 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {ver.formattedDate}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-white line-clamp-2">{ver.summary}</p>
                </div>

                <button
                  type="button"
                  disabled={restoringId === ver.id}
                  onClick={() => handleRestore(ver)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 border border-primary-500/20 transition-all disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {restoringId === ver.id ? 'Memulihkan...' : 'Pulihkan'}
                </button>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-white/40 space-y-2">
              <FileText className="h-8 w-8 mx-auto opacity-30" />
              <p className="text-xs">Belum ada versi tersimpan untuk dokumen ini.</p>
              <p className="text-[11px] text-white/30">Setiap perubahan AI akan membuat versi baru secara otomatis.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
