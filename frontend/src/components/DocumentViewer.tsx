import { forwardRef } from 'react';
import { Loader2, Monitor, Smartphone } from 'lucide-react';

export type DocumentViewMode = 'desktop' | 'mobile';

interface DocumentViewerProps {
  isRendering: boolean;
  statusMessage: string;
  viewMode: DocumentViewMode;
  onViewModeChange: (mode: DocumentViewMode) => void;
  onTextSelect?: (text: string) => void;
  onImageUpload?: (file: File) => void;
  onImageSelect?: (image: HTMLImageElement) => void;
  onImageDeselect?: () => void;
  imageSelected?: boolean;
  selectedImageSize?: string;
}

export const DocumentViewer = forwardRef<HTMLDivElement, DocumentViewerProps>(
  ({ isRendering, statusMessage, viewMode, onViewModeChange, onTextSelect, onImageUpload, onImageSelect, onImageDeselect, imageSelected, selectedImageSize }, ref) => {

    return (
      <div className="document-shell flex h-full flex-col">
        <div className="document-toolbar flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/18" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary-500 shadow-[0_0_10px_rgba(59,102,255,.85)]" />
            </div>
            <span className="pixel-label ml-2 text-[10px] font-medium tracking-[.12em] text-white/52">DOCUMENT CANVAS</span>
          </div>
          <div className="flex items-center gap-3">
            {imageSelected && selectedImageSize && (
              <span className="image-size-badge pixel-label flex items-center gap-1.5 rounded-full border border-primary-500/40 bg-primary-500/15 px-3 py-1 text-[10px] font-semibold tracking-[.08em] text-primary-200 shadow-[0_0_14px_rgba(59,102,255,.25)]">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-400 shadow-[0_0_8px_rgba(59,102,255,.9)]" />
                {selectedImageSize}
              </span>
            )}
            <label className="pixel-label cursor-pointer text-[10px] font-medium tracking-[.1em] text-primary-100/65 hover:text-primary-300 transition-colors">
              {imageSelected ? 'REPLACE IMAGE' : 'ADD IMAGE'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onImageUpload?.(file);
                  event.target.value = '';
                }}
              />
            </label>
            <span className="pixel-label hidden text-[10px] font-medium tracking-[.1em] text-primary-100/50 lg:inline">
              LAYOUT LOCKED / AI EDITABLE
            </span>
          </div>

        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center justify-center border-b border-white/8 bg-[#0b0e16]/60 px-4 py-2 backdrop-blur-sm">
          <div className="view-toggle" role="group" aria-label="Document view mode">
            <button
              type="button"
              className={`view-toggle__option ${viewMode === 'desktop' ? 'view-toggle__option--active' : ''}`}
              onClick={() => onViewModeChange('desktop')}
              aria-pressed={viewMode === 'desktop'}
              title="Desktop View - render dokumen dengan ukuran asli (A4)"
            >
              <Monitor className="h-3.5 w-3.5" strokeWidth={2} />
              <span>Desktop View</span>
            </button>
            <button
              type="button"
              className={`view-toggle__option ${viewMode === 'mobile' ? 'view-toggle__option--active' : ''}`}
              onClick={() => onViewModeChange('mobile')}
              aria-pressed={viewMode === 'mobile'}
              title="Mobile View - dokumen mengikuti lebar layar"
            >
              <Smartphone className="h-3.5 w-3.5" strokeWidth={2} />
              <span>Mobile View</span>
            </button>
          </div>
        </div>

        <div className="relative flex-1 overflow-auto">
          {isRendering && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0b0e16]/72 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-primary-500" strokeWidth={1.5} />
              <span className="mt-3 text-sm font-medium text-white/75">{statusMessage}</span>
            </div>
          )}

          <div className={`flex justify-center px-3 py-6 sm:px-8 sm:py-12 ${viewMode === 'mobile' ? 'view-mode-mobile' : 'view-mode-desktop'}`}>
            <div className="image-canvas-stage w-full max-w-204">
            <div
              ref={ref}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                const image = target.closest('img');
                if (image) {
                  event.stopPropagation();
                  onImageSelect?.(image as HTMLImageElement);
                  return;
                }
                onImageDeselect?.();
                const block = target.closest('p, td, th, li, h1, h2, h3, h4, h5, h6');
                const text = block?.textContent?.trim();
                if (text) onTextSelect?.(text);
              }}
              className="docx-preview-wrapper document-paper w-full max-w-204 rounded-xl bg-white p-5 sm:p-12"
              style={{ minHeight: '500px' }}
            />
            </div>
          </div>

        </div>
      </div>
    );
  },
);

DocumentViewer.displayName = 'DocumentViewer';

