import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FileText,
  ImagePlus,
  Languages,
  List,
  RotateCcw,
  Send,
  Sparkles,
  X,
  Wand2,
} from 'lucide-react';
import type { ChatMessage } from '@/types';
import { STANDARD_FONTS } from '@/utils/fonts';
import { DiffViewer } from './DiffViewer';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (prompt: string, fontFamily: string, referenceImage?: File) => void;
  isThinking: boolean;
  onRevert: (messageId: string) => void;
  onApprove: (messageId: string) => void;
  onDiscard: (messageId: string) => void;
  canRevert: boolean;
  documentFont?: string;
  prefillPrompt?: string;
  canChat: boolean;
  onRequireLogin: () => void;
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
  canRevert,
  documentFont = '',
  prefillPrompt = '',
  canChat,
  onRequireLogin,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [fontFamily, setFontFamily] = useState('');
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string>('');
  const [attachmentError, setAttachmentError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
              canRevert={canRevert}
            />
          ))
        )}
        {isThinking && <ThinkingIndicator />}
      </div>

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
  canRevert,
}: {
  message: ChatMessage;
  onRevert: (id: string) => void;
  onApprove: (id: string) => void;
  onDiscard: (id: string) => void;
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
        {message.reviewStatus === 'pending' && message.diff && message.diff.length > 0 && (
          <DiffViewer
            diffs={message.diff}
            onApply={() => { onApprove(message.id); setShowDiff(false); }}
            onDiscard={() => { onDiscard(message.id); setShowDiff(false); }}
          />
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
        <span className="ml-1.5 text-[13px] text-white/48">Working on it</span>
      </div>
    </div>
  );
}
