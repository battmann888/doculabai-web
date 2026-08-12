import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Header } from '@/components/Header';
import { UploadZone } from '@/components/UploadZone';
import { DashboardSidebar, type DocumentHistoryItem } from '@/components/DashboardSidebar';
import { LoginModal, type MockUser } from '@/components/LoginModal';
import { UpgradeModal } from '@/components/UpgradeModal';
import { ProfileModal, type AppTheme } from '@/components/ProfileModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DocumentSkeleton, ChatSkeleton } from '@/components/Skeleton';
import { ToastContainer, useToast } from '@/components/Toast';
import { ProgressBar } from '@/components/ProgressBar';
import { logger } from '@/utils/logger';

const DocumentViewer = lazy(() => import('@/components/DocumentViewer').then(m => ({ default: m.DocumentViewer })));
const ChatPanel = lazy(() => import('@/components/ChatPanel').then(m => ({ default: m.ChatPanel })));
import {
  addImageToDocx,
  applyEditsToDocx,
  animateEditedSegments,
  renderDocx,
  exportEditableDocx,
  findImageSegment,
  fileToDataUrl,
  openEditableDocx,
  replaceImageInDocx,
  replaceTextWithImage,
  replaceImageWithText,
  resizeImageInDocx,
  type EditableDocx,
} from '@/utils/docxProcessor';
import { sendEditCommand } from '@/utils/api';
import { detectDocumentFont } from '@/utils/fonts';
import type { ChatMessage, DocSegment, ProcessingStatus } from '@/types';
import { authUserToProfile, supabase } from '@/utils/supabase';
import { getAbstractAvatar } from '@/utils/avatars';
import {
  getUsageCount,
  incrementUsageCount,
  isUsageLimitReached,
} from '@/utils/usageStore';
import {
  listHistoryForUser,
  loadDocumentFromHistory,
  saveDocumentToHistory,
  updateDocumentInHistory,
} from '@/utils/documentHistoryStore';

type AuthNotice = { type: 'success' | 'error'; message: string };
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface FileSelectOptions {
  historyId?: string;
}

function promptNeedsImageContext(prompt: string): boolean {
  return /\b(gambar|image|foto|photo|logo|header|footer|diagram|chart|grafik|ocr)\b/i.test(prompt);
}

function promptRequestsImageReplacement(prompt: string): boolean {
  return /\b(ganti|ubah|tukar|replace|change|swap)\b.*\b(gambar|foto|image|photo|logo)\b/i.test(prompt)
    || /\b(gambar|foto|image|photo|logo)\b.*\b(ganti|ubah|tukar|replace|change|swap)\b/i.test(prompt);
}

function promptRequestsTextToImage(prompt: string): boolean {
  return /\b(teks|text|paragraf|judul|tulisan)\b.*\b(gambar|foto|image|photo|logo)\b/i.test(prompt)
    || /\b(gambar|foto|image|photo|logo)\b.*\b(teks|text|paragraf|judul|tulisan)\b/i.test(prompt);
}

function requestedImageWidthCm(prompt: string): number {
  const explicit = prompt.match(/(\d+(?:[.,]\d+)?)\s*cm/i);
  if (explicit) return Math.min(16, Math.max(1, Number(explicit[1].replace(',', '.'))));
  if (/\b(besar|large|lebar)\b/i.test(prompt)) return 12;
  if (/\b(kecil|small)\b/i.test(prompt)) return 4;
  return 6;
}

function promptRequestsImageToText(prompt: string): boolean {
  return /\b(gambar|foto|image|photo|logo)\b.*\b(teks|text|tulisan|ocr|bacakan|baca)\b/i.test(prompt)
    || /\b(ubah|jadikan|konversi|convert|ocr)\b.*\b(gambar|foto|image)\b.*\b(teks|text|tulisan)\b/i.test(prompt);
}

function resolveTheme(theme: AppTheme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return theme;
}

function promptRequestsImageResize(prompt: string): boolean {
  return /\b(gambar|foto|image|photo|logo)\b/i.test(prompt)
    && (/\d+\s*(?:cm|px)/i.test(prompt) || /\b(besar|kecil|lebar|sempit|large|small|perbesar|perkecil|besarkan|kecilkan|resize|ubah ukuran)\b/i.test(prompt));
}

function findImageBySegmentText(container: HTMLElement, segment: DocSegment): HTMLImageElement | null {
  if (segment.type !== 'image') return null;
  const text = segment.text || '';
  if (!text) return null;
  const candidates = Array.from(container.querySelectorAll('img'));
  return candidates.find(img => (img.alt || '').includes(text)) || null;
}

function animateImageAppear(container: HTMLElement, segment: DocSegment) {
  const img = findImageBySegmentText(container, segment);
  if (!img) return;
  img.classList.remove('image-appearing');
  void img.offsetWidth;
  img.classList.add('image-appearing');
  img.classList.add('image-selected');
  window.setTimeout(() => img.classList.remove('image-appearing'), 500);
}

function animateImageResize(container: HTMLElement, segment: DocSegment) {
  const img = findImageBySegmentText(container, segment);
  if (!img) return;
  img.classList.remove('image-resizing');
  void img.offsetWidth;
  img.classList.add('image-resizing');
  img.classList.add('image-selected');
  window.setTimeout(() => img.classList.remove('image-resizing'), 700);
}

function animateImageReplaced(container: HTMLElement, segment: DocSegment) {
  const img = findImageBySegmentText(container, segment);
  if (!img) return;
  img.classList.remove('image-replaced');
  void img.offsetWidth;
  img.classList.add('image-replaced');
  img.classList.add('image-selected');
  window.setTimeout(() => img.classList.remove('image-replaced'), 450);
}

function showResizePreview(image: HTMLImageElement) {
  image.classList.add('image-resize-preview');
}

export default function App() {
  const [status, setStatus] = useState<ProcessingStatus>({
    stage: 'idle',
    message: '',
  });
  const [fileName, setFileName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [documentFont, setDocumentFont] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [imageRect, setImageRect] = useState<DOMRect | null>(null);

  // Update image rect when scrolling or resizing
  useEffect(() => {
    if (!selectedImage) {
      setImageRect(null);
      return;
    }
    const updateRect = () => {
      setImageRect(selectedImage.getBoundingClientRect());
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    const container = viewerRef.current?.parentElement;
    if (container) {
      container.addEventListener('scroll', updateRect);
    }
    return () => {
      window.removeEventListener('resize', updateRect);
      if (container) {
        container.removeEventListener('scroll', updateRect);
      }
    };
  }, [selectedImage]);
  const [editHistory, setEditHistory] = useState<
    { messageId: string; html: string; docx?: Blob }[]
  >([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<MockUser>({
    id: '',
    name: 'Guest',
    email: '',
    avatar: getAbstractAvatar(0),
    profileCompleted: false,
  });
  const [documentHistory, setDocumentHistory] = useState<DocumentHistoryItem[]>([]);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [uploadPickerSignal, setUploadPickerSignal] = useState(0);
  const [authNotice, setAuthNotice] = useState<AuthNotice | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(() => (localStorage.getItem('doculabai.theme') as AppTheme) || 'dark');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [operationProgress, setOperationProgress] = useState<{ message: string; progress: number } | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const currentHistoryIdRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const authNoticeTimerRef = useRef<number | null>(null);
  const { toasts, showToast, dismissToast, success, error, info, warning } = useToast();

  const showAuthNotice = useCallback((notice: AuthNotice, duration = 4000) => {
    if (notice.type === 'success') {
      success(notice.message, duration);
    } else if (notice.type === 'error') {
      error(notice.message, duration);
    }
  }, [success, error]);

  const viewerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<File | null>(null);
  const segmentsRef = useRef<DocSegment[]>([]);
  const imagesRef = useRef<Record<string, string>>({});
  const documentRef = useRef<EditableDocx | null>(null);
  const selectedImageSegmentRef = useRef<DocSegment | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted || !data.session?.user) return;
      const profile = authUserToProfile(data.session.user);
      setUser(profile);
      setIsAuthenticated(true);
      setUsageCount(getUsageCount(profile.id));
      if (!profile.profileCompleted) setIsProfileOpen(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setIsAuthenticated(false);
        setUser({ id: '', name: 'Guest', email: '', avatar: getAbstractAvatar(0), profileCompleted: false });
        setDocumentHistory([]);
        setUsageCount(0);
        return;
      }
      const profile = authUserToProfile(session.user);
      setUser(profile);
      setIsAuthenticated(true);
      setUsageCount(getUsageCount(profile.id));
      setIsLoginOpen(false);
      if (_event === 'SIGNED_IN') {
        showAuthNotice({ type: 'success', message: `Berhasil login sebagai ${profile.name}` });
        if (!profile.profileCompleted) setIsProfileOpen(true);
      }
    });
    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const isReady = status.stage === 'ready';

  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(theme);
    localStorage.setItem('doculabai.theme', theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme('system');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    if (!isAuthenticated || !user.id) {
      setDocumentHistory([]);
      return;
    }
    void listHistoryForUser(user.id).then(setDocumentHistory).catch(() => setDocumentHistory([]));
  }, [isAuthenticated, user.id]);

  const persistDocumentSnapshot = useCallback(async (name?: string) => {
    if (!documentRef.current || !user.id || !currentHistoryIdRef.current) return;
    setSaveStatus('saving');
    try {
      const blob = await exportEditableDocx(documentRef.current);
      const updated = await updateDocumentInHistory(
        user.id,
        currentHistoryIdRef.current,
        blob,
        name,
      );
      if (updated) {
        setDocumentHistory((current) =>
          [updated, ...current.filter((entry) => entry.id !== updated.id)].slice(0, 20),
        );
        setSaveStatus('saved');
        window.setTimeout(() => setSaveStatus('idle'), 2500);
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Autosave failed:', err);
      setSaveStatus('error');
    }
  }, [user.id]);

  const scheduleAutosave = useCallback((name?: string) => {
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void persistDocumentSnapshot(name);
    }, 1500);
  }, [persistDocumentSnapshot]);

  const handleFileSelect = useCallback(async (file: File, options?: FileSelectOptions) => {
    if (!isAuthenticated || !user.id) {
      pendingFileRef.current = file;
      setIsLoginOpen(true);
      return;
    }
    if (isUsageLimitReached(user.id)) {
      setIsUpgradeOpen(true);
      return;
    }

    logger.info('Document', `Loading file: ${file.name}`);
    fileRef.current = file;
    setFileName(file.name);
    setDocumentFont('');
    setSelectedImage(null);
    selectedImageSegmentRef.current = null;
    setSelectedText('');
    setMessages([]);
    setEditHistory([]);
    setStatus({ stage: 'parsing', message: 'Reading document…' });

    try {
      const documentModel = await openEditableDocx(file);
      documentRef.current = documentModel;
      const { segments: segs, fontFamily: sourceFont, images } = documentModel;
      segmentsRef.current = segs;
      imagesRef.current = images;
      setDocumentFont(sourceFont);
      logger.info('Document', `Document parsed with ${segs.length} segments and ${Object.keys(images).length} images`);

      setStatus({ stage: 'rendering', message: 'Rendering layout…' });

      if (viewerRef.current) {
        viewerRef.current.innerHTML = '';
        try {
          await renderDocx(file, viewerRef.current);
          if (!sourceFont) {
            setDocumentFont(detectDocumentFont(viewerRef.current));
          }
          logger.info('Document', 'Document rendered successfully');
          setStatus({ stage: 'ready', message: '' });
        } catch (err) {
          console.error('Render error:', err);
          logger.error('Document', 'Failed to render document', err);
          setStatus({
            stage: 'error',
            message: 'Could not render this document. Please try a different file.',
          });
          error('Gagal merender dokumen. Pastikan file DOCX yang valid.');
          return;
        }
      }

      if (documentRef.current) {
        const exported = await exportEditableDocx(documentRef.current);
        if (options?.historyId) {
          currentHistoryIdRef.current = options.historyId;
          const updated = await updateDocumentInHistory(user.id, options.historyId, exported, file.name);
          if (updated) {
            setDocumentHistory((current) =>
              [updated, ...current.filter((entry) => entry.id !== updated.id)].slice(0, 20),
            );
          }
        } else {
          const item = await saveDocumentToHistory(user.id, file, exported);
          currentHistoryIdRef.current = item.id;
          setDocumentHistory((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 20));
        }
      }
    } catch (err) {
      console.error('Parse error:', err);
      logger.error('Document', 'Failed to parse document', err);
      setStatus({
        stage: 'error',
        message: 'Could not read this file. Make sure it is a valid .docx.',
      });
      error('Gagal membaca dokumen. Pastikan file DOCX yang valid.');
    }
  }, [isAuthenticated, user.id, error]);

  const requestUpload = useCallback((file?: File) => {
    pendingFileRef.current = file || null;
    if (!isAuthenticated) {
      setIsLoginOpen(true);
      showAuthNotice({ type: 'error', message: 'Silakan login untuk mengunggah dokumen.' });
      return;
    }
    if (isUsageLimitReached(user.id)) {
      setIsUpgradeOpen(true);
      return;
    }
    if (file) {
      void handleFileSelect(file);
    } else {
      setUploadPickerSignal((value) => value + 1);
    }
  }, [isAuthenticated, user.id, handleFileSelect]);

  const handleLoginSuccess = useCallback((nextUser: MockUser) => {
    setUser(nextUser);
    setIsAuthenticated(true);
    setUsageCount(getUsageCount(nextUser.id));
    setIsLoginOpen(false);
    if (!nextUser.profileCompleted) setIsProfileOpen(true);
    if (pendingFileRef.current) {
      const pending = pendingFileRef.current;
      pendingFileRef.current = null;
      void handleFileSelect(pending);
    } else {
      setUploadPickerSignal((value) => value + 1);
    }
  }, [handleFileSelect]);

  const handleHistorySelect = useCallback(async (item: DocumentHistoryItem) => {
    if (!user.id) return;
    setIsSidebarOpen(false);
    const file = await loadDocumentFromHistory(user.id, item.id);
    if (!file) {
      showAuthNotice({ type: 'error', message: 'Dokumen tidak ditemukan di perangkat ini.' });
      return;
    }
    void handleFileSelect(file, { historyId: item.id });
  }, [user.id, handleFileSelect]);

  const resetWorkspace = useCallback(() => {
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    currentHistoryIdRef.current = null;
    fileRef.current = null;
    documentRef.current = null;
    segmentsRef.current = [];
    imagesRef.current = {};
    selectedImageSegmentRef.current = null;
    setFileName(null);
    setMessages([]);
    setEditHistory([]);
    setSelectedImage(null);
    setSelectedText('');
    setDocumentFont('');
    setStatus({ stage: 'idle', message: '' });
    setSaveStatus('idle');
  }, []);

  const handleLogout = useCallback(() => {
    void supabase?.auth.signOut();
    setIsAuthenticated(false);
    setIsSidebarOpen(false);
    setIsProfileOpen(false);
    resetWorkspace();
    setIsLoginOpen(true);
    showAuthNotice({ type: 'success', message: 'Anda sudah keluar. Silakan login kembali untuk melanjutkan.' });
  }, [resetWorkspace, showAuthNotice]);

  const handleSendPrompt = useCallback(
    async (prompt: string, fontFamily: string, referenceImage?: File) => {
      if (!viewerRef.current || !fileRef.current) return;

      if (!isAuthenticated || !user.id) {
        setIsLoginOpen(true);
        showAuthNotice({ type: 'error', message: 'Silakan login untuk mengirim pesan.' });
        return;
      }

      if (isUsageLimitReached(user.id)) {
        setIsUpgradeOpen(true);
        return;
      }

      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
        attachmentName: referenceImage?.name,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsThinking(true);
      setOperationProgress({ message: 'Menganalisis dokumen...', progress: 10 });
      logger.info('AI', `Processing prompt: ${prompt.substring(0, 50)}...`);

      const currentSegments = segmentsRef.current;
      const documentText = currentSegments.map((segment) => segment.text).join('\n');

      try {
        const referenceImageData = referenceImage
          ? await fileToDataUrl(referenceImage)
          : undefined;

        let localImageAction = false;

        if (referenceImage && promptRequestsTextToImage(prompt) && documentRef.current) {
          const target = currentSegments.find((segment) => segment.type === 'paragraph' && (
            selectedText.trim() && segment.text.includes(selectedText.trim())
          )) || currentSegments.find((segment) => segment.type === 'paragraph');
          if (!target) throw new Error('Pilih teks yang ingin diganti dengan gambar terlebih dahulu.');
          await replaceTextWithImage(documentRef.current, target, referenceImage, requestedImageWidthCm(prompt));
          imagesRef.current = documentRef.current.images;
          segmentsRef.current = documentRef.current.segments;
          const refreshed = await exportEditableDocx(documentRef.current);
          viewerRef.current.innerHTML = '';
          await renderDocx(refreshed, viewerRef.current);
          if (viewerRef.current) animateImageAppear(viewerRef.current, target);
          setSelectedText('');
          localImageAction = true;
        } else if (referenceImage && documentRef.current) {
          const target = selectedImageSegmentRef.current
            || (promptRequestsImageReplacement(prompt)
              ? currentSegments.find((segment) => segment.type === 'image')
              : null);
          if (target) {
            await replaceImageInDocx(documentRef.current, target, referenceImage);
            imagesRef.current = documentRef.current.images;
            segmentsRef.current = documentRef.current.segments;
            const refreshed = await exportEditableDocx(documentRef.current);
            viewerRef.current.innerHTML = '';
            await renderDocx(refreshed, viewerRef.current);
            if (viewerRef.current) animateImageReplaced(viewerRef.current, target);
            localImageAction = true;
          }
        }

        if (selectedImageSegmentRef.current && promptRequestsImageResize(prompt) && documentRef.current) {
          if (selectedImage?.isConnected) showResizePreview(selectedImage);
          await resizeImageInDocx(documentRef.current, selectedImageSegmentRef.current, requestedImageWidthCm(prompt));
          const refreshed = await exportEditableDocx(documentRef.current);
          viewerRef.current.innerHTML = '';
          await renderDocx(refreshed, viewerRef.current);
          if (viewerRef.current) animateImageResize(viewerRef.current, selectedImageSegmentRef.current);
          localImageAction = true;
        }

        const needsImageContext = promptNeedsImageContext(prompt)
          || Boolean(referenceImage)
          || promptRequestsImageToText(prompt)
          || localImageAction;

        // Create new AbortController for this request
        abortControllerRef.current = new AbortController();
        setOperationProgress({ message: 'Memproses permintaan AI...', progress: 30 });

        const response = await sendEditCommand({
          documentText,
          segments: segmentsRef.current,
          userPrompt: prompt,
          conversationHistory: messages,
          fileName: fileRef.current.name,
          fontFamily: fontFamily || undefined,
          images: needsImageContext ? imagesRef.current : undefined,
          referenceImage: referenceImageData,
        }, abortControllerRef.current.signal);

        setOperationProgress({ message: 'Menerapkan perubahan...', progress: 70 });

        const currentHtml = viewerRef.current.innerHTML;
        const currentDocx = documentRef.current ? await exportEditableDocx(documentRef.current) : undefined;
        setEditHistory((prev) => [
          ...prev,
          { messageId: userMsg.id, html: currentHtml, docx: currentDocx },
        ]);

        let appliedIds: string[] = [];
        if (response.success && response.edits.length > 0 && documentRef.current) {
          const imageTextEdits = response.edits.filter((edit) => edit.action === 'replace_image_with_text');
          for (const edit of imageTextEdits) {
            const segment = documentRef.current.segments.find((item) => item.id === edit.segmentId);
            if (segment) {
              await replaceImageWithText(documentRef.current, segment, edit.after);
              appliedIds.push(edit.segmentId);
            }
          }
          const textEdits = response.edits.filter((edit) => edit.action !== 'replace_image_with_text');
          appliedIds = [...new Set([...appliedIds, ...await applyEditsToDocx(documentRef.current, textEdits)])];
          if (appliedIds.length > 0) {
            setOperationProgress({ message: 'Merender dokumen...', progress: 90 });
            const refreshed = await exportEditableDocx(documentRef.current);
            viewerRef.current.innerHTML = '';
            await renderDocx(refreshed, viewerRef.current);
            animateEditedSegments(viewerRef.current, documentRef.current.segments, appliedIds);
          }
          segmentsRef.current = documentRef.current.segments;
        }

        setOperationProgress({ message: 'Selesai', progress: 100 });

        const aiMsg: ChatMessage = {
          id: `msg_${Date.now()}_a`,
          role: 'assistant',
          content: response.explanation,
          timestamp: Date.now(),
          applied: appliedIds.length > 0,
          action: response.action,
          affectedSegments: appliedIds,
          diff: response.edits,
          reviewStatus: 'approved',
        };
        setMessages((prev) => [...prev, aiMsg]);
        logger.info('AI', `AI response received with ${appliedIds.length} applied edits`);
        if (response.success && (appliedIds.length > 0 || localImageAction)) {
          const nextCount = incrementUsageCount(user.id);
          setUsageCount(nextCount);
 scheduleAutosave(fileRef.current.name);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          info('Permintaan dibatalkan');
          logger.warn('AI', 'Request aborted by user');
        } else {
          console.error('Document edit failed:', err);
          logger.error('AI', 'Document edit failed', err);
          const message = err instanceof Error ? err.message : 'Perintah belum bisa diproses. Coba lagi.';
          const errorMsg: ChatMessage = {
            id: `msg_${Date.now()}_e`,
            role: 'assistant',
            content: message,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errorMsg]);
        }
      } finally {
        setIsThinking(false);
        abortControllerRef.current = null;
        setTimeout(() => setOperationProgress(null), 500);
      }
    },
    [messages, selectedImage, isAuthenticated, user.id, scheduleAutosave, showAuthNotice, info],
  );

  const handleImageSelect = useCallback((image: HTMLImageElement) => {
    setSelectedImage((current) => {
      if (current && current !== image) current.classList.remove('image-selected');
      image.classList.add('image-selected');
      return image;
    });
    selectedImageSegmentRef.current = documentRef.current
      ? findImageSegment(documentRef.current, image) || null
      : null;
    setSelectedText('Replace the selected image with a new image');
  }, []);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!viewerRef.current) return;
    const model = documentRef.current;
    if (!model) return;
    if (selectedImage?.isConnected && selectedImageSegmentRef.current) {
      await replaceImageInDocx(model, selectedImageSegmentRef.current, file);
      imagesRef.current = model.images;
      segmentsRef.current = model.segments;
      const refreshed = await exportEditableDocx(model);
      viewerRef.current.innerHTML = '';
      await renderDocx(refreshed, viewerRef.current);
      if (viewerRef.current) animateImageReplaced(viewerRef.current, selectedImageSegmentRef.current);
      setSelectedImage(null);
      selectedImageSegmentRef.current = null;
    } else {
      await addImageToDocx(model, file);
      imagesRef.current = model.images;
      segmentsRef.current = model.segments;
      const refreshed = await exportEditableDocx(model);
      viewerRef.current.innerHTML = '';
      await renderDocx(refreshed, viewerRef.current);
    }
    scheduleAutosave(fileRef.current?.name);
  }, [selectedImage, scheduleAutosave]);

  const handleRevert = useCallback(
    (messageId: string) => {
      const historyItem = [...editHistory]
        .reverse()
        .find((h) => h.messageId === messageId);
      if (historyItem && viewerRef.current) {
        viewerRef.current.innerHTML = historyItem.html;
        if (historyItem.docx) {
          openEditableDocx(historyItem.docx).then((model) => {
            documentRef.current = model;
            segmentsRef.current = model.segments;
            imagesRef.current = model.images;
          });
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, applied: false, content: m.content + ' (reverted)' }
              : m,
          ),
        );
      }
    },
    [editHistory],
  );

  const handleDownload = useCallback(async (format: 'docx' | 'pdf' = 'docx') => {
    if (!documentRef.current || !fileName) return;
    setIsDownloading(true);
    try {
      if (format === 'pdf') {
        // For PDF export, use browser's print functionality
        const printContent = viewerRef.current?.innerHTML;
        if (!printContent) throw new Error('No content to export');
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) throw new Error('Failed to open print window');
        
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${fileName.replace('.docx', '')}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
              img { max-width: 100%; height: auto; }
              table { border-collapse: collapse; width: 100%; margin: 16px 0; }
              td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }
              h1, h2, h3 { margin-top: 24px; margin-bottom: 16px; }
              p { margin-bottom: 16px; }
            </style>
          </head>
          <body>${printContent}</body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
        success('PDF export dialog opened');
      } else {
        const blob = await exportEditableDocx(documentRef.current);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName.replace(/\.docx$/i, '') + '-edited.docx';
        link.click();
        URL.revokeObjectURL(url);
        success('Dokumen berhasil diunduh');
      }
    } catch (err) {
      console.error('Download error:', err);
      error('Dokumen tidak dapat diekspor. Silakan coba lagi.');
    } finally {
      setIsDownloading(false);
    }
  }, [fileName, success, error]);

  const handleReset = useCallback(() => {
    if (fileRef.current) {
      setMessages([]);
      setEditHistory([]);
      handleFileSelect(fileRef.current);
    }
  }, [handleFileSelect]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S - Save/Download
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isReady && fileRef.current) {
          void handleDownload();
        }
      }

      // Ctrl/Cmd + Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (editHistory.length > 0) {
          const lastHistory = editHistory[editHistory.length - 1];
          handleRevert(lastHistory.messageId);
        }
      }

      // Ctrl/Cmd + Shift + Z - Redo (not implemented yet, but shortcut ready)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        // Redo functionality can be added here
      }

      // Escape - Close modals / Deselect image
      if (e.key === 'Escape') {
        if (selectedImage?.isConnected) {
          selectedImage.classList.remove('image-selected');
          setSelectedImage(null);
          selectedImageSegmentRef.current = null;
        }
        if (isLoginOpen) setIsLoginOpen(false);
        if (isUpgradeOpen) setIsUpgradeOpen(false);
        if (isProfileOpen) setIsProfileOpen(false);
        if (isSidebarOpen) setIsSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReady, editHistory, selectedImage, isLoginOpen, isUpgradeOpen, isProfileOpen, isSidebarOpen, handleDownload, handleRevert]);

  const overlays = (
    <>
      <DashboardSidebar
        open={isSidebarOpen}
        user={user}
        usageCount={usageCount}
        history={documentHistory}
        onClose={() => setIsSidebarOpen(false)}
        onUpload={() => { setIsSidebarOpen(false); requestUpload(); }}
        onHistorySelect={handleHistorySelect}
        onProfileSettings={() => { setIsSidebarOpen(false); setIsProfileOpen(true); }}
        onLogout={handleLogout}
      />
      {isLoginOpen && <LoginModal onClose={() => setIsLoginOpen(false)} onSuccess={handleLoginSuccess} />}
      {isUpgradeOpen && <UpgradeModal onClose={() => setIsUpgradeOpen(false)} />}
      {isProfileOpen && <ProfileModal user={user} theme={theme} onClose={() => setIsProfileOpen(false)} onLogout={handleLogout} onSave={(nextUser, nextTheme, birthDate) => { setUser(nextUser); setTheme(nextTheme); localStorage.setItem('doculabai.birthDate', birthDate); void supabase?.auth.updateUser({ data: { full_name: nextUser.name, avatar_url: nextUser.avatar, birth_date: birthDate, profile_completed: true } }); setIsProfileOpen(false); showAuthNotice({ type: 'success', message: 'Profil berhasil disimpan.' }); }} />}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {operationProgress && <ProgressBar message={operationProgress.message} progress={operationProgress.progress} />}
      {imageRect && selectedImage && (
        <div
          style={{
            position: 'fixed',
            top: imageRect.top,
            left: imageRect.left,
            width: imageRect.width,
            height: imageRect.height,
            pointerEvents: 'none',
            zIndex: 40,
            border: '2px solid #3b66ff',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.5), 0 4px 12px rgba(59,102,255,0.3)',
          }}
        >
          {/* Corner handles */}
          {[
            { top: -4, left: -4, cursor: 'nwse-resize' },
            { top: -4, right: -4, cursor: 'nesw-resize' },
            { bottom: -4, left: -4, cursor: 'nesw-resize' },
            { bottom: -4, right: -4, cursor: 'nwse-resize' },
          ].map((pos, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: 8,
                height: 8,
                backgroundColor: '#fff',
                border: '2px solid #3b66ff',
                borderRadius: '50%',
                ...pos,
              }}
            />
          ))}
        </div>
      )}
    </>
  );

  if (status.stage === 'idle' || status.stage === 'error') {
    return (
      <div className="min-h-screen bg-surface-0">
        <Header
          fileName={null}
          onDownload={handleDownload}
          onReset={handleReset}
          isReady={false}
          isDownloading={isDownloading}
          onLogoClick={() => setIsSidebarOpen(true)}
          user={isAuthenticated ? user : undefined}
          onProfileClick={() => setIsProfileOpen(true)}
        />
        <UploadZone
          onFileSelect={handleFileSelect}
          onRequestUpload={requestUpload}
          openPickerSignal={uploadPickerSignal}
          isLoading={false}
          statusMessage={status.message}
        />
        {status.stage === 'error' && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-error-500 px-5 py-3 text-sm font-semibold text-white shadow-elevated animate-fade-in-up">
            {status.message}
          </div>
        )}
        {overlays}
      </div>
    );
  }

  if (status.stage === 'parsing') {
    return (
      <div className="min-h-screen bg-surface-0">
        <Header
          fileName={fileName}
          onDownload={handleDownload}
          onReset={handleReset}
          isReady={false}
          isDownloading={isDownloading}
          onLogoClick={() => setIsSidebarOpen(true)}
          user={isAuthenticated ? user : undefined}
          onProfileClick={() => setIsProfileOpen(true)}
        />
        <UploadZone
          onFileSelect={handleFileSelect}
          onRequestUpload={requestUpload}
          openPickerSignal={uploadPickerSignal}
          isLoading
          statusMessage={status.message}
        />
        {overlays}
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="workspace-shell flex h-screen flex-col">
      <Header
        fileName={fileName}
        onDownload={handleDownload}
        onReset={handleReset}
        isReady={isReady}
        isDownloading={isDownloading}
        onUploadFile={handleFileSelect}
        onRequestUpload={requestUpload}
        uploadPickerSignal={uploadPickerSignal}
        onLogoClick={() => setIsSidebarOpen(true)}
        user={isAuthenticated ? user : undefined}
        onProfileClick={() => setIsProfileOpen(true)}
      />
      <section className="workspace-dashboard" aria-label="Document dashboard">
        <div>
          <span className="pixel-label workspace-dashboard__eyebrow">WORKSPACE DASHBOARD</span>
          <strong>{fileName}</strong>
        </div>
        <div className="workspace-dashboard__stats">
          <span><b>{segmentsRef.current.filter((segment) => segment.type === 'table').length}</b> tables</span>
          <span><b>{segmentsRef.current.filter((segment) => segment.type === 'image').length}</b> images</span>
          <span><b>{documentFont || 'Original'}</b> font</span>
        </div>
      </section>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<DocumentSkeleton />}>
            <DocumentViewer
              ref={viewerRef}
              isRendering={status.stage === 'rendering'}
              statusMessage={status.message}
              onTextSelect={setSelectedText}
              onImageUpload={handleImageUpload}
              onImageSelect={handleImageSelect}
              imageSelected={Boolean(selectedImage?.isConnected)}
            />
          </Suspense>
        </div>

        <div className="w-[400px] shrink-0 max-lg:w-[340px]">
          <Suspense fallback={<ChatSkeleton />}>
            <ChatPanel
              messages={messages}
              onSend={handleSendPrompt}
              isThinking={isThinking}
              onRevert={handleRevert}
              onApprove={() => undefined}
              onDiscard={() => undefined}
              canChat={isAuthenticated}
              onRequireLogin={() => { setIsLoginOpen(true); showAuthNotice({ type: 'error', message: 'Silakan login untuk mengirim pesan.' }); }}
              canRevert={editHistory.length > 0}
              documentFont={documentFont}
              prefillPrompt={selectedText}
            />
          </Suspense>
        </div>
      </div>
      {overlays}
    </div>
    </ErrorBoundary>
  );
}