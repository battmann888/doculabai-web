import { forwardRef, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface DocumentViewerProps {
  isRendering: boolean;
  statusMessage: string;
  onTextSelect?: (text: string) => void;
  onImageUpload?: (file: File) => void;
  onImageSelect?: (image: HTMLImageElement) => void;
  onImageDeselect?: () => void;
  imageSelected?: boolean;
}

export const DocumentViewer = forwardRef<HTMLDivElement, DocumentViewerProps>(
  ({ isRendering, statusMessage, onTextSelect, onImageUpload, onImageSelect, onImageDeselect, imageSelected }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (typeof ref === 'function') {
        ref(innerRef.current);
        return;
      }

      if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = innerRef.current;
      }
    }, [ref]);

    return (
      <div className="document-shell flex h-full flex-col">
        <div className="document-toolbar flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/18" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary-500 shadow-[0_0_10px_rgba(59,102,255,.85)]" />
            </div>
            <span className="pixel-label ml-2 text-[10px] font-medium tracking-[.12em] text-white/52">DOCUMENT CANVAS</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="pixel-label cursor-pointer text-[10px] font-medium tracking-[.1em] text-primary-100/65">
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
            <span className="pixel-label text-[10px] font-medium tracking-[.1em] text-primary-100/50">
              LAYOUT LOCKED / AI EDITABLE
            </span>
          </div>
        </div>

        <div className="relative flex-1 overflow-auto">
          {isRendering && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0b0e16]/72 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-primary-500" strokeWidth={1.5} />
              <span className="mt-3 text-sm font-medium text-white/75">{statusMessage}</span>
            </div>
          )}

          <div className="flex justify-center px-4 py-8 sm:px-8 sm:py-12">
            <div className="image-canvas-stage">
            <div
              ref={innerRef}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                const image = target.closest('img');
                if (image) {
                  event.stopPropagation();
                  onImageSelect?.(image);
                  return;
                }
                onImageDeselect?.();
                const block = target.closest('p, td, th, li, h1, h2, h3, h4, h5, h6');
                const text = block?.textContent?.trim();
                if (text) onTextSelect?.(text);
              }}
              className="docx-preview-wrapper document-paper w-full max-w-204 rounded-xl bg-white p-8 sm:p-12"
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
