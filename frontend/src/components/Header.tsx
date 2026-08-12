import { Download, FilePlus2, RotateCcw, FileText, File } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LogoMark } from './LogoMark';
import type { MockUser } from './LoginModal';

interface HeaderProps {
  fileName: string | null;
  onDownload: (format: 'docx' | 'pdf') => void;
  onReset: () => void;
  isReady: boolean;
  isDownloading: boolean;
  onUploadFile?: (file: File) => void;
  onRequestUpload?: (file?: File) => void;
  uploadPickerSignal?: number;
  onLogoClick?: () => void;
  user?: MockUser;
  onProfileClick?: () => void;
}

export function Header({
  fileName,
  onDownload,
  onReset,
  isReady,
  isDownloading,
  onUploadFile,
  onRequestUpload,
  uploadPickerSignal = 0,
  onLogoClick,
  user,
  onProfileClick,
}: HeaderProps) {
  const isWorkspace = Boolean(fileName);
  const inputRef = useRef<HTMLInputElement>(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  useEffect(() => {
    if (uploadPickerSignal > 0) inputRef.current?.click();
  }, [uploadPickerSignal]);

  return (
    <header className={`app-header ${isWorkspace ? 'app-header--workspace' : 'app-header--landing'}`} role="banner">
      <div className="app-header__inner">
        <button type="button" className="app-header__logo-button" onClick={onLogoClick} aria-label="Open dashboard" tabIndex={0}>
          <LogoMark size="sm" className="app-header__mark" />
        </button>

        {isWorkspace && (
          <>
          <div className="app-header__actions">
            <span className="app-header__filename" title={fileName ?? undefined}>
              {fileName}
            </span>
            {user && (
              <button type="button" className="header-profile-chip" onClick={onProfileClick} title="Open profile">
                <img src={user.avatar} alt="" />
                <span>{user.name}</span>
              </button>
            )}
            {isReady && (
              <>
                <button type="button" className="header-upload-button" title="Upload new document" onClick={() => onRequestUpload?.()}>
                  <FilePlus2 className="h-4 w-4" strokeWidth={1.8} />
                  <span>New file</span>
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="header-icon-button"
                  aria-label="Reset document"
                  title="Reset document"
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={1.8} />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                    disabled={isDownloading}
                    className="header-download-button"
                  >
                    <Download className="h-4 w-4" strokeWidth={2} />
                    <span>{isDownloading ? 'Preparing' : 'Export'}</span>
                  </button>
                  {exportDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 bg-surface-900 border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px] z-50">
                      <button
                        type="button"
                        onClick={() => { onDownload('docx'); setExportDropdownOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2"
                      >
                        <File className="h-4 w-4" />
                        <span>DOCX</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { onDownload('pdf'); setExportDropdownOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        <span>PDF</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".docx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onRequestUpload?.(file); event.target.value = ''; }} />
          </>
        )}
      </div>
    </header>
  );
}
