import { useState, useEffect, useRef } from 'react';
import { X, Layers, Plus, Trash2, FileText, Upload } from 'lucide-react';
import {
  listTemplatesForUser,
  saveTemplate,
  deleteTemplate,
  type DocumentTemplateItem,
} from '@/utils/templateStore';

interface TemplateModalProps {
  userId: string;
  onClose: () => void;
  onSelectTemplate: (file: File) => void;
  currentDocumentBlob?: Blob | null;
  currentDocumentName?: string | null;
}

export function TemplateModal({
  userId,
  onClose,
  onSelectTemplate,
  currentDocumentBlob,
  currentDocumentName,
}: TemplateModalProps) {
  const [templates, setTemplates] = useState<DocumentTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCurrent, setSavingCurrent] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState(currentDocumentName || '');
  const [templateDescInput, setTemplateDescInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    void listTemplatesForUser(userId).then((items) => {
      if (mounted) {
        setTemplates(items);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const handleSaveCurrentAsTemplate = async () => {
    if (!currentDocumentBlob || !templateNameInput.trim()) return;
    setSavingCurrent(true);
    try {
      const item = await saveTemplate(
        userId,
        templateNameInput.trim(),
        templateDescInput.trim(),
        currentDocumentBlob,
      );
      setTemplates((prev) => [item, ...prev]);
      setTemplateDescInput('');
    } finally {
      setSavingCurrent(false);
    }
  };

  const handleCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    const item = await saveTemplate(userId, file.name, 'Uploaded custom template', blob);
    setTemplates((prev) => [item, ...prev]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (templateId: string) => {
    const ok = await deleteTemplate(userId, templateId);
    if (ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    }
  };

  const handleUseTemplate = (item: DocumentTemplateItem) => {
    const file = new File([item.blob], item.name, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    onSelectTemplate(file);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-surface-1 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary-500/10 text-primary-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Template Dokumen</h2>
              <p className="text-xs text-white/50">Gunakan kembali struktur & layout favorit Anda</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Tutup modal template"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {currentDocumentBlob && (

            <div className="p-4 rounded-xl bg-primary-500/5 border border-primary-500/20 space-y-3">
              <h3 className="text-xs font-bold text-primary-300 uppercase tracking-wider">
                Simpan Dokumen Saat Ini Sebagai Template
              </h3>
              <div className="space-y-2">
                <input
                  type="text"
                  value={templateNameInput}
                  onChange={(e) => setTemplateNameInput(e.target.value)}
                  placeholder="Nama Template..."
                  className="w-full bg-white/5 text-xs text-white px-3 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-primary-500"
                />
                <input
                  type="text"
                  value={templateDescInput}
                  onChange={(e) => setTemplateDescInput(e.target.value)}
                  placeholder="Deskripsi singkat (opsional)..."
                  className="w-full bg-white/5 text-xs text-white px-3 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-primary-500"
                />
                <button
                  type="button"
                  disabled={savingCurrent || !templateNameInput.trim()}
                  onClick={handleSaveCurrentAsTemplate}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg bg-primary-500 hover:bg-primary-600 text-white transition-all disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {savingCurrent ? 'Menyimpan Template...' : 'Simpan Sebagai Template'}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">

            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
              Daftar Template Anda ({templates.length})
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Template Baru
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              onChange={handleCustomUpload}
              className="hidden"
            />
          </div>

          {loading ? (

            <div className="py-12 text-center text-xs text-white/40">Memuat template...</div>
          ) : templates.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="group relative p-4 rounded-xl bg-white/5 border border-white/10 hover:border-primary-500/40 transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary-400 shrink-0" />
                      <h4 className="text-xs font-bold text-white truncate">{tpl.name}</h4>
                    </div>
                    <p className="text-[11px] text-white/50 line-clamp-2">{tpl.description}</p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => handleUseTemplate(tpl)}
                      className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 transition-all"
                    >
                      Gunakan Template
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tpl.id)}
                      className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      title="Hapus Template"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-white/40 space-y-2">
              <Layers className="h-8 w-8 mx-auto opacity-30" />
              <p className="text-xs">Belum ada template tersimpan.</p>
              <p className="text-[11px] text-white/30">
                Upload file DOCX atau simpan dokumen aktif sebagai template untuk menggunakannya kembali kapan saja.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
