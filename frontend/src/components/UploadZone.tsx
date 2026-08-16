import { useCallback, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, FileText, ShieldCheck, Upload } from 'lucide-react';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  statusMessage?: string;
  onRequestUpload: (file?: File, openPicker?: boolean) => boolean | void;
}

const capabilities = [
  { index: '01', icon: FileText, label: 'Structure intact', copy: 'Your layout and document rhythm remain in place.' },
  { index: '02', icon: ShieldCheck, label: 'Private by design', copy: 'A focused workspace for your documents.' },
  { index: '03', icon: ArrowDown, label: 'Ready to deliver', copy: 'Export a clean, editable DOCX when you are done.' },
];

export function UploadZone({ onFileSelect, isLoading, statusMessage, onRequestUpload }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file?.name.toLowerCase().endsWith('.docx')) onRequestUpload(file);
  }, [onRequestUpload]);

  const selectFile = () => {
    onRequestUpload(undefined, true);
  };

  return (
    <main className="landing-shell">
      <div className="landing-noise" />
      <div className="landing-grid" />
      <div className="landing-orbit landing-orbit--one" />
      <div className="landing-orbit landing-orbit--two" />
      <div className="landing-beam" />

      <div className="landing-content">
        <section className="landing-hero animate-fade-in">
          <div className="landing-status pixel-label">
            <span className="landing-status__dot" />
            DOCUMENT INTELLIGENCE
          </div>
          <h1 className="landing-title">
            Make the next
            <span> version unmistakable.</span>
          </h1>
          <p className="landing-copy">
            An unusually calm place to make every document clearer, sharper, and ready for its next decision.
          </p>

          <div
            className={`upload-command ${isDragging ? 'upload-command--dragging' : ''} animate-fade-in-up [animation-delay:140ms]`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <button type="button" onClick={selectFile} disabled={isLoading} className="upload-command__button">
              <span className="upload-command__icon">
                {isLoading ? <span className="upload-command__spinner" /> : <Upload className="h-[18px] w-[18px]" strokeWidth={1.8} />}
              </span>
              <span className="upload-command__copy">
                <strong>{isLoading ? statusMessage || 'Preparing your document' : 'Start with a document'}</strong>
                <small>{isLoading ? 'Building your editing space' : 'Drop a DOCX here or choose a file'}</small>
              </span>
              <ArrowUpRight className="upload-command__arrow" strokeWidth={1.7} />
            </button>
          </div>
          <p className="landing-caption pixel-label">DOCX ONLY &nbsp; / &nbsp; YOUR WORKSPACE</p>
        </section>

        <section className="capability-row animate-fade-in-up [animation-delay:220ms]">
          {capabilities.map(({ index, icon: Icon, label, copy }) => (
            <article key={index} className="capability-card">
              <span className="capability-card__index pixel-label">{index}</span>
              <Icon className="capability-card__icon" strokeWidth={1.7} />
              <div>
                <h2>{label}</h2>
                <p>{copy}</p>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
