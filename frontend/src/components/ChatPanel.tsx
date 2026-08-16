import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  ImagePlus,
  Languages,
  List,
  RotateCcw,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
  Wand2,
  AlertCircle,
} from 'lucide-react';
import type { AIRecommendation, ChatMessage, DocSegment, OperationResult, StructuredEdit } from '@/types';
import { STANDARD_FONTS } from '@/utils/fonts';
import { DiffViewer } from './DiffViewer';



interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (prompt: string, fontFamily: string, referenceImage?: File) => void;
  isThinking: boolean;
  onRevert: (messageId: string) => void;
  onApprove: (messageId: string) => void;
  onDiscard: (messageId: string) => void;
  onAcceptRecommendation: (messageId: string, recommendation: AIRecommendation) => void;
  onDismissRecommendation: (messageId: string, recommendationId: string) => void;
  canRevert: boolean;
  documentFont?: string;
  prefillPrompt?: string;
  canChat: boolean;
  onRequireLogin: () => void;
  imageSegments?: DocSegment[];
  imagesMap?: Record<string, string>;
  selectedImageSegment?: DocSegment | null;
  onStructuredEdit?: (edit: StructuredEdit) => void;
}


const QUICK_ACTIONS = [
  { label: 'Make it more formal', icon: Wand2 },
  { label: 'Fix grammar and spelling', icon: FileText },
  { label: 'Summarize key points', icon: List },
  { label: 'Translate to Indonesian', icon: Languages },
];

export function ChatPanel({
  messages,
  onSend,
  isThinking,
  onRevert,
  onApprove,
  onDiscard,
  onAcceptRecommendation,
  onDismissRecommendation,
  canRevert,
  documentFont = '',
  prefillPrompt = '',
  canChat,
  onRequireLogin,
  imageSegments = [],
  imagesMap = {},
  selectedImageSegment = null,
  onStructuredEdit,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [fontFamily, setFontFamily] = useState('');
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string>('');
  const [attachmentError, setAttachmentError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [showImageReplace, setShowImageReplace] = useState(false);
  const [selectedImageToReplace, setSelectedImageToReplace] = useState<string | null>(null);
  const [replacementImage, setReplacementImage] = useState<File | null>(null);
  const [replacementImagePreview, setReplacementImagePreview] = useState<string>('');
  const [actionMode, setActionMode] = useState<'menu' | 'text' | 'table' | 'image'>('menu');
  const [textValue, setTextValue] = useState('');
  const [textFont, setTextFont] = useState('');
  const [textSize, setTextSize] = useState('');
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [tableRows, setTableRows] = useState(2);
  const [tableCols, setTableCols] = useState(2);
  const [tableCells, setTableCells] = useState<string[][]>([['', ''], ['', '']]);
  const [structuredError, setStructuredError] = useState('');

  useEffect(() => {
    if (selectedImageSegment) {
      setShowImageReplace(true);
      setSelectedImageToReplace(selectedImageSegment.id);
      setActionMode('menu');
    }
  }, [selectedImageSegment]);


  useEffect(() => {
    if (!prefillPrompt) return;
    setInput(`Edit this text: "${prefillPrompt}"`);
    inputRef.current?.focus();
  }, [prefillPrompt]);

  const fontOptions = useMemo(() => {
    const options = [
      {
        value: '',
        label: documentFont ? `Document font (${documentFont})` : 'Keep original font',
      },
    ];

    if (
      documentFont &&
      !STANDARD_FONTS.some((font) => font.value.toLowerCase() === documentFont.toLowerCase())
    ) {
      options.push({ value: documentFont, label: documentFont });
    }

    return [...options, ...STANDARD_FONTS];
  }, [documentFont]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isThinking]);

  const send = (prompt = input) => {
    const value = prompt.trim();
    if (!value || isThinking) return;
    if (!canChat) {
      onRequireLogin();
      return;
    }

    onSend(value, fontFamily, referenceImage || undefined);
    setInput('');
    setReferenceImage(null);
    setAttachmentError('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const attachReferenceImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAttachmentError('Pilih file gambar yang valid.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError('Ukuran gambar maksimal 10 MB.');
      return;
    }
    setAttachmentError('');
    setReferenceImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setReferenceImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const autoGrow = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  };

  return (
    <aside className="chat-panel flex h-full flex-col" role="complementary" aria-label="AI Assistant chat panel">
      <header className="assistant-header">
        <div className="chat-icon flex h-9 w-9 items-center justify-center rounded-xl" aria-hidden="true">
          <Sparkles className="h-4 w-4" strokeWidth={1.8} />
        </div>
        <div>
          <p className="m-0 text-sm font-semibold text-white">Assistant</p>
          <p className="pixel-label m-0 mt-0.5 text-[10px] tracking-[.11em] text-primary-100/55">
            DOCUMENT COPILOT
          </p>
        </div>
        <span className="assistant-header__status" aria-label="Assistant online" />
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 ? (
          <EmptyAssistant onSend={send} fontFamily={fontFamily} documentFont={documentFont} />
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onRevert={onRevert}
              onApprove={onApprove}
              onDiscard={onDiscard}
              onAcceptRecommendation={onAcceptRecommendation}
              onDismissRecommendation={onDismissRecommendation}
              canRevert={canRevert}
            />
          ))
        )}
        {isThinking && <ThinkingIndicator />}
      </div>

      {showImageReplace && (
        <div className="mx-4 mb-2 rounded-xl border border-white/10 bg-[#161b22] p-4 text-white shadow-xl animate-fade-in-up">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white/90 flex items-center gap-2">
              <ImagePlus className="h-4 w-4 text-primary-400" />
              Ubah Gambar
            </h4>
            <button type="button" onClick={() => { setShowImageReplace(false); setSelectedImageToReplace(null); setActionMode('menu'); }} className="text-white/40 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!selectedImageToReplace ? (
            <div>
              <p className="mb-2 text-[12px] text-white/60">Pilih gambar yang ingin diubah:</p>
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {imageSegments.map((seg) => (
                  <button
                    key={seg.id}
                    type="button"
                    onClick={() => { setSelectedImageToReplace(seg.id); setActionMode('menu'); }}
                    className="shrink-0 overflow-hidden rounded-lg border-2 border-transparent hover:border-primary-500/50"
                  >
                    <img
                      src={imagesMap[seg.meta?.imagePath || '']}
                      alt="Document image"
                      className="h-16 w-16 object-cover"
                    />
                  </button>
                ))}
                {imageSegments.length === 0 && <p className="text-[11px] text-white/40">Tidak ada gambar di dokumen ini.</p>}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1">
                  <span className="pixel-label text-[9px] text-white/40">GAMBAR LAMA</span>
                  <div className="h-20 w-20 overflow-hidden rounded-lg border border-white/10 bg-black/20">
                    <img
                      src={imagesMap[imageSegments.find(s => s.id === selectedImageToReplace)?.meta?.imagePath || '']}
                      alt="Original"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>

                {actionMode === 'menu' && (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="rounded bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white"
                      onClick={() => { setActionMode('text'); setStructuredError(''); }}
                    >
                      Ganti Teks
                    </button>
                    <button
                      type="button"
                      className="rounded bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white"
                      onClick={() => { setActionMode('table'); setStructuredError(''); }}
                    >
                      Ganti Tabel
                    </button>
                    <button
                      type="button"
                      className="rounded bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white"
                      onClick={() => { setActionMode('image'); setStructuredError(''); }}
                    >
                      Ganti Gambar
                    </button>
                  </div>
                )}

                {actionMode === 'image' && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="pixel-label text-[9px] text-white/40">GAMBAR BARU</span>
                    {replacementImagePreview ? (
                      <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-primary-500/50">
                        <img src={replacementImagePreview} alt="New" className="h-full w-full object-cover" />
                        <button type="button" onClick={() => { setReplacementImage(null); setReplacementImagePreview(''); }} className="absolute right-1 top-1 rounded bg-black/50 p-1 text-white hover:bg-black/70">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40 transition-colors">
                        <ImagePlus className="mb-1 h-5 w-5 text-white/50" />
                        <span className="text-[10px] text-white/50">Upload</span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setReplacementImage(file);
                              const reader = new FileReader();
                              reader.onload = (e) => setReplacementImagePreview(e.target?.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>

              {actionMode === 'text' && (
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="pixel-label text-[9px] text-white/40">TEKS BARU</span>
                    <textarea
                      value={textValue}
                      onChange={(e) => setTextValue(e.target.value)}
                      rows={2}
                      placeholder="Tulis teks pengganti..."
                      className="resize-none rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:border-primary-500/50 focus:outline-none"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="pixel-label text-[9px] text-white/40">FONT</span>
                      <select
                        value={textFont}
                        onChange={(e) => setTextFont(e.target.value)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white focus:border-primary-500/50 focus:outline-none"
                      >
                        <option value="">Dokumen ({documentFont || 'asli'})</option>
                        {STANDARD_FONTS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="pixel-label text-[9px] text-white/40">UKURAN (PT)</span>
                      <input
                        type="number"
                        min={6}
                        max={72}
                        value={textSize}
                        onChange={(e) => setTextSize(e.target.value)}
                        placeholder="12"
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:border-primary-500/50 focus:outline-none"
                      />
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 text-[11px] text-white/60">
                      <input type="checkbox" checked={textBold} onChange={(e) => setTextBold(e.target.checked)} className="accent-primary-500" />
                      Bold
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-white/60">
                      <input type="checkbox" checked={textItalic} onChange={(e) => setTextItalic(e.target.checked)} className="accent-primary-500" />
                      Italic
                    </label>
                  </div>
                  {structuredError && <p className="text-[11px] text-red-400">{structuredError}</p>}
                  <button
                    type="button"
                    disabled={!textValue.trim() || isThinking}
                    className="w-full rounded-lg bg-primary-600 py-2 text-xs font-semibold text-white hover:bg-primary-500 disabled:opacity-40 shadow-[0_0_15px_rgba(59,102,255,0.3)] transition-all"
                    onClick={() => {
                      if (!textValue.trim()) { setStructuredError('Tulis teks pengganti terlebih dahulu.'); return; }
                      onStructuredEdit?.({
                        kind: 'replace-image-with-text',
                        segmentId: selectedImageToReplace,
                        text: textValue.trim(),
                        fontFamily: textFont || undefined,
                        fontSize: textSize ? Number(textSize) : undefined,
                        bold: textBold,
                        italic: textItalic,
                      });
                      setShowImageReplace(false);
                      setSelectedImageToReplace(null);
                      setActionMode('menu');
                      setTextValue('');
                      setTextFont('');
                      setTextSize('');
                      setTextBold(false);
                      setTextItalic(false);
                    }}
                  >
                    Terapkan Teks
                  </button>
                </div>
              )}

              {actionMode === 'table' && (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="pixel-label text-[9px] text-white/40">BARIS</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={tableRows}
                        onChange={(e) => {
                          const rows = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                          setTableRows(rows);
                          setTableCells((prev) => {
                            const next = Array.from({ length: rows }, (_, r) => prev[r] ? [...prev[r]] : Array(tableCols).fill(''));
                            return next;
                          });
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white focus:border-primary-500/50 focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="pixel-label text-[9px] text-white/40">KOLOM</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={tableCols}
                        onChange={(e) => {
                          const cols = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                          setTableCols(cols);
                          setTableCells((prev) => prev.map((row) => {
                            const next = Array.from({ length: cols }, (_, c) => row[c] ?? '');
                            return next;
                          }));
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white focus:border-primary-500/50 focus:outline-none"
                      />
                    </label>
                  </div>
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full border-collapse">
                      <tbody>
                        {Array.from({ length: tableRows }, (_, r) => (
                          <tr key={r}>
                            {Array.from({ length: tableCols }, (_, c) => (
                              <td key={c} className="border border-white/10 p-0.5">
                                <input
                                  value={tableCells[r]?.[c] ?? ''}
                                  onChange={(e) => {
                                    setTableCells((prev) => {
                                      const next = prev.map((row) => [...row]);
                                      if (!next[r]) next[r] = [];
                                      next[r][c] = e.target.value;
                                      return next;
                                    });
                                  }}
                                  placeholder={`${r + 1},${c + 1}`}
                                  className="w-full bg-transparent px-1 py-1 text-[11px] text-white placeholder:text-white/25 focus:outline-none"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {structuredError && <p className="text-[11px] text-red-400">{structuredError}</p>}
                  <button
                    type="button"
                    disabled={isThinking}
                    className="w-full rounded-lg bg-primary-600 py-2 text-xs font-semibold text-white hover:bg-primary-500 disabled:opacity-40 shadow-[0_0_15px_rgba(59,102,255,0.3)] transition-all"
                    onClick={() => {
                      const cells = Array.from({ length: tableRows }, (_, r) =>
                        Array.from({ length: tableCols }, (_, c) => tableCells[r]?.[c] ?? ''),
                      );
                      onStructuredEdit?.({
                        kind: 'replace-image-with-table',
                        segmentId: selectedImageToReplace,
                        rows: tableRows,
                        cols: tableCols,
                        cells,
                      });
                      setShowImageReplace(false);
                      setSelectedImageToReplace(null);
                      setActionMode('menu');
                      setTableRows(2);
                      setTableCols(2);
                      setTableCells([['', ''], ['', '']]);
                    }}
                  >
                    Terapkan Tabel
                  </button>
                </div>
              )}

              {actionMode === 'image' && replacementImage && (
                <button
                  type="button"
                  disabled={isThinking}
                  className="w-full rounded-lg bg-primary-600 py-2 text-xs font-semibold text-white hover:bg-primary-500 disabled:opacity-40 shadow-[0_0_15px_rgba(59,102,255,0.3)] transition-all"
                  onClick={() => {
                    onStructuredEdit?.({
                      kind: 'replace-image',
                      segmentId: selectedImageToReplace,
                      file: replacementImage,
                    });
                    setShowImageReplace(false);
                    setSelectedImageToReplace(null);
                    setActionMode('menu');
                    setReplacementImage(null);
                    setReplacementImagePreview('');
                  }}
                >
                  Terapkan Perubahan Gambar
                </button>
              )}
            </div>
          )}
        </div>
      )}


      <div className="assistant-composer">
        <label className="assistant-font-label" htmlFor="font-select">
          <span className="pixel-label">OUTPUT FONT</span>
          <select
            id="font-select"
            value={fontFamily}
            onChange={(event) => setFontFamily(event.target.value)}
            disabled={isThinking}
            style={{ fontFamily: fontFamily || documentFont || undefined }}
            aria-label="Select output font"
          >
            {fontOptions.map((option) => (
              <option
                key={`${option.value || 'original'}-${option.label}`}
                value={option.value}
                style={{ fontFamily: option.value || documentFont || undefined }}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {referenceImage && (
          <div className="prompt-attachment">
            <ImagePlus className="h-3.5 w-3.5" />
            {referenceImagePreview && <img src={referenceImagePreview} alt="Preview" className="h-6 w-6 rounded object-cover" />}
            <span title={referenceImage.name}>{referenceImage.name}</span>
            <button type="button" onClick={() => { setReferenceImage(null); setReferenceImagePreview(''); }} aria-label="Remove attached image">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {attachmentError && <p className="prompt-attachment__error">{attachmentError}</p>}
        <div className="chat-input-shell flex items-end gap-2 rounded-2xl p-2">
          <label className="assistant-attach-button" title="Attach reference image" aria-label="Attach reference image">
            <ImagePlus className="h-4 w-4" strokeWidth={1.8} />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              disabled={isThinking}
              aria-label="Upload reference image"
              onChange={(event) => {
                attachReferenceImage(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              autoGrow(event.target);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Tell me what to change..."
            rows={1}
            disabled={isThinking}
            className="max-h-30 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] text-white placeholder:text-white/34 focus:outline-none"
            aria-label="Type your message"
            aria-describedby="input-hint"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={!input.trim() || isThinking}
            className="assistant-send-button"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <p id="input-hint" className="pixel-label assistant-composer__hint">ENTER TO SEND / SHIFT + ENTER FOR NEW LINE</p>
      </div>
    </aside>
  );
}

function EmptyAssistant({
  onSend,
  fontFamily,
  documentFont,
}: {
  onSend: (prompt: string) => void;
  fontFamily: string;
  documentFont: string;
}) {
  return (
    <div className="assistant-empty animate-fade-in">
      <div className="assistant-empty__glyph">
        <Sparkles className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <h2>What should improve?</h2>
      <p>Ask for a focused change. Your document structure stays protected.</p>
      {documentFont && <span className="assistant-empty__font">Detected: {documentFont}</span>}
      <div className="assistant-quick-actions">
        {QUICK_ACTIONS.slice(0, 3).map(({ label, icon: Icon }, index) => (
          <button
            key={label}
            type="button"
            onClick={() => onSend(label)}
            className="assistant-quick-action animate-fade-in-up"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <span className="sr-only">Selected font: {fontFamily || documentFont || 'original document font'}</span>
    </div>
  );
}

function MessageBubble({
  message,
  onRevert,
  onApprove,
  onDiscard,
  onAcceptRecommendation,
  onDismissRecommendation,
  canRevert,
}: {
  message: ChatMessage;
  onRevert: (id: string) => void;
  onApprove: (id: string) => void;
  onDiscard: (id: string) => void;
  onAcceptRecommendation: (messageId: string, recommendation: AIRecommendation) => void;
  onDismissRecommendation: (messageId: string, recommendationId: string) => void;
  canRevert: boolean;
}) {
  const [showDiff, setShowDiff] = useState(message.reviewStatus === 'pending');

  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div className="message-user">
          {message.content}
          {message.attachmentName && (
            <span className="message-user__attachment">
              <ImagePlus className="h-3 w-3" />
              {message.attachmentName}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="assistant-message animate-fade-in-up">
      <div className="chat-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
      <div className="flex-1">
        <div className="message-assistant">{message.content}</div>

        {message.reviewStatus === 'pending' && (

          <DiffViewer
            diffs={message.diff ?? []}
            operations={message.operations}
            onApply={() => { onApprove(message.id); setShowDiff(false); }}
            onDiscard={() => { onDiscard(message.id); setShowDiff(false); }}
          />
        )}

        {message.operationResults && message.operationResults.length > 0 && (
          <OperationResultsSummary results={message.operationResults} />
        )}

        {message.recommendations && message.recommendations.length > 0 && (

          <div className="mt-3 flex flex-col gap-2">
            {message.recommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                messageId={message.id}
                recommendation={rec as AIRecommendation & { _accepted?: boolean; _dismissed?: boolean }}
                onAccept={onAcceptRecommendation}
                onDismiss={onDismissRecommendation}
              />
            ))}
          </div>
        )}

        {message.reviewStatus === 'discarded' && <span className="message-discarded">Perubahan dibatalkan</span>}
        {message.applied && (
          <div className="mt-2 flex items-center gap-2">
            <span className="message-applied">
              <Check className="h-3 w-3" strokeWidth={2.5} />
              Applied
            </span>
            {canRevert && (
              <button type="button" onClick={() => onRevert(message.id)} className="message-revert">
                <RotateCcw className="h-3 w-3" strokeWidth={2} />
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function OperationResultsSummary({ results }: { results: OperationResult[] }) {
  const [expanded, setExpanded] = useState(false);
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;
  if (results.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-white/4 text-[12px]">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-white/60 hover:text-white/80"
        onClick={() => setExpanded((v) => !v)}
      >
        {failCount > 0 ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        )}
        <span className="flex-1">
          {successCount}/{results.length} operations applied
          {failCount > 0 && ` · ${failCount} failed`}
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {expanded && (
        <ul className="border-t border-white/8 px-3 pb-2 pt-1 space-y-1">
          {results.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              {r.success ? (
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
              ) : (
                <X className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
              )}
              <span className={r.success ? 'text-white/70' : 'text-red-300/80'}>
                {r.description}{r.error ? ` — ${r.error}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


function RecommendationCard({
  messageId,
  recommendation,
  onAccept,
  onDismiss,
}: {
  messageId: string;
  recommendation: AIRecommendation & { _accepted?: boolean; _dismissed?: boolean };
  onAccept: (messageId: string, rec: AIRecommendation) => void;
  onDismiss: (messageId: string, recId: string) => void;
}) {
  if (recommendation._dismissed) return null;

  const accepted = recommendation._accepted ?? false;

  return (
    <div
      className={[
        'rounded-xl border px-3 py-2.5 text-[12px] transition-opacity',
        accepted
          ? 'border-emerald-500/30 bg-emerald-500/8 opacity-70'
          : 'border-primary-500/30 bg-primary-500/6 hover:bg-primary-500/10',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-300" strokeWidth={1.8} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white/90 leading-snug">{recommendation.title}</p>
          <p className="mt-0.5 text-white/55 leading-relaxed">{recommendation.description}</p>
        </div>
      </div>
      {!accepted && (
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onAccept(messageId, recommendation)}
            className="flex items-center gap-1.5 rounded-lg bg-primary-500/20 px-2.5 py-1 text-[11px] font-semibold text-primary-200 hover:bg-primary-500/35 transition-colors"
          >
            <ThumbsUp className="h-3 w-3" strokeWidth={2} />
            Apply
          </button>
          <button
            type="button"
            onClick={() => onDismiss(messageId, recommendation.id)}
            className="flex items-center gap-1.5 rounded-lg bg-white/6 px-2.5 py-1 text-[11px] text-white/50 hover:bg-white/10 hover:text-white/70 transition-colors"
          >
            <ThumbsDown className="h-3 w-3" strokeWidth={2} />
            Dismiss
          </button>
        </div>
      )}
      {accepted && (
        <div className="mt-2 flex items-center gap-1.5 text-emerald-400">
          <Check className="h-3 w-3" strokeWidth={2.5} />
          <span className="text-[11px] font-semibold">Applied</span>
        </div>
      )}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="assistant-message animate-fade-in">
      <div className="chat-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
      <div className="message-assistant flex items-center gap-1.5">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 rounded-full bg-primary-400"
            style={{ animation: 'thinkingDot 1.4s infinite', animationDelay: `${dot * 200}ms` }}
          />
        ))}
        <span className="ml-1.5 text-[13px] text-white/48">Menyiapkan perubahan…</span>
      </div>
    </div>
  );
}
