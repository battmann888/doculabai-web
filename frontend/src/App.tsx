import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Header } from '@/components/Header';

import { UploadZone } from '@/components/UploadZone';
import { LandingPage } from '@/components/LandingPage';

import { DashboardSidebar, type DocumentHistoryItem } from '@/components/DashboardSidebar';
import { LoginModal, type MockUser } from '@/components/LoginModal';
import { UpgradeModal } from '@/components/UpgradeModal';
import { ProfileModal, type AppTheme } from '@/components/ProfileModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DocumentSkeleton, ChatSkeleton } from '@/components/Skeleton';
import { ToastContainer, useToast } from '@/components/Toast';
import { ProgressBar } from '@/components/ProgressBar';
import { VersionHistoryModal } from '@/components/VersionHistoryModal';
import { TemplateModal } from '@/components/TemplateModal';
import { DocumentViewer, type DocumentViewMode } from '@/components/DocumentViewer';
import { ChatPanel } from '@/components/ChatPanel';

import { logger } from '@/utils/logger';
import { planDocumentEdit } from '@/utils/api';

import {
  addImageToDocx,
  applyEditsToDocx,
  animateEditedSegments,
  renderDocx,
  exportEditableDocx,
  findImageSegment,
  openEditableDocx,
  replaceImageInDocx,
  replaceTextWithImage,
  replaceImageWithText,
  replaceImageWithTable,
  resizeImageInDocx,
  applyTextFormatting,
  dispatchOperation,
  type EditableDocx,
} from '@/utils/docxProcessor';

import { detectDocumentFont } from '@/utils/fonts';
import type { AIEditResponse, AIRecommendation, ChatMessage, DocSegment, ProcessingStatus, StructuredEdit } from '@/types';

import { authUserToProfile, supabase } from '@/utils/supabase';
import { getAbstractAvatar } from '@/utils/avatars';
import {
  getUsageCount,
  incrementUsageCount,
  isUsageLimitReached,
} from '@/utils/usageStore';
import {
  deleteDocumentFromHistory,
  listHistoryForUser,
  loadDocumentFromHistory,
  saveDocumentToHistory,
  updateDocumentInHistory,
} from '@/utils/documentHistoryStore';
import { saveDocumentVersion } from '@/utils/documentVersionStore';
import {
  moveDocumentToTrash,
  listTrashForUser,
  restoreDocumentFromTrash,
  deletePermanentlyFromTrash,
  type TrashItem,
} from '@/utils/trashStore';

type AuthNotice = { type: 'success' | 'error'; message: string };
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface FileSelectOptions {
  historyId?: string;
}

type LocalImageChange =
  | { kind: 'replace-image'; segmentId: string; file: File }
  | { kind: 'replace-text-with-image'; segmentId: string; file: File; widthCm: number }
  | { kind: 'resize-image'; segmentId: string; widthCm: number };


interface PendingChange {

  response: AIEditResponse;
  localImageChange?: LocalImageChange;
  referenceImage?: File;
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
  const [selectedImageSize, setSelectedImageSize] = useState<string>('');


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
  const [editHistory, setEditHistory] = useState<{ messageId: string; docx: Blob }[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<MockUser>({
    id: '',
    name: 'Guest',
    email: '',
    avatar: getAbstractAvatar(0),
    profileCompleted: false,
  });
  const [documentHistory, setDocumentHistory] = useState<DocumentHistoryItem[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [viewMode, setViewMode] = useState<DocumentViewMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop',
  );


  const [authNotice, setAuthNotice] = useState<AuthNotice | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(() => (localStorage.getItem('doculabai.theme') as AppTheme) || 'dark');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [operationProgress, setOperationProgress] = useState<{ message: string; progress: number } | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const currentHistoryIdRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const authNoticeTimerRef = useRef<number | null>(null);
  const globalUploadInputRef = useRef<HTMLInputElement>(null);

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
  const pendingChangesRef = useRef(new Map<string, PendingChange>());

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
        setTrashItems([]);
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
      setTrashItems([]);
      return;
    }
    void listHistoryForUser(user.id).then((items) => {
      setDocumentHistory(items);


      const recoveryId = sessionStorage.getItem(`doculabai.activeDoc.${user.id}`);
      if (recoveryId) {
        const target = items.find((item) => item.id === recoveryId);
        if (target) {
          info(`Sesi sebelumnya ditemukan: "${target.name}". Klik untuk melanjutkan.`);
        }
      }
    }).catch(() => setDocumentHistory([]));
    void listTrashForUser(user.id).then(setTrashItems).catch(() => setTrashItems([]));
  }, [isAuthenticated, user.id]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = 'Perubahan dokumen Anda sedang disimpan. Yakin ingin meninggalkan halaman?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  useEffect(() => {
    const handleOffline = () => warning('Koneksi terputus. Perubahan akan disimpan saat kembali online.');
    const handleOnline = () => info('Koneksi kembali. Lanjutkan pekerjaan Anda.');
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [warning, info]);

  const handleDeleteHistoryItem = useCallback(
    async (item: DocumentHistoryItem) => {
      if (!user.id) return;


      const deletedRecord = await deleteDocumentFromHistory(user.id, item.id);
      if (deletedRecord) {
        const trash = await moveDocumentToTrash(
          user.id,
          item.id,
          item.name,
          item.meta,
          deletedRecord.blob,
        );
        setDocumentHistory((prev) => prev.filter((doc) => doc.id !== item.id));
        setTrashItems((prev) => [trash, ...prev]);
        info(`Dokumen "${item.name}" dipindahkan ke Sampah.`);
      }
    },
    [user.id, info],
  );

  const handleRestoreTrashItem = useCallback(
    async (item: TrashItem) => {
      if (!user.id) return;
      const restored = await restoreDocumentFromTrash(user.id, item.id);
      if (restored) {
        const file = new File([restored.blob], restored.name);
        const histItem = await saveDocumentToHistory(user.id, file, restored.blob);
        setTrashItems((prev) => prev.filter((doc) => doc.id !== item.id));
        setDocumentHistory((prev) => [histItem, ...prev]);
        success(`Dokumen "${item.name}" dipulihkan.`);
      }
    },
    [user.id, success],
  );

  const handlePermanentDeleteTrashItem = useCallback(
    async (item: TrashItem) => {
      if (!user.id) return;
      const ok = await deletePermanentlyFromTrash(user.id, item.id);
      if (ok) {
        setTrashItems((prev) => prev.filter((doc) => doc.id !== item.id));
        info(`Dokumen "${item.name}" dihapus permanen.`);
      }
    },
    [user.id, info],
  );

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



    logger.info('Document', `Loading file: ${file.name}`);
    fileRef.current = file;
    setFileName(file.name);
    setDocumentFont('');
    setSelectedImage(null);

    selectedImageSegmentRef.current = null;
    setSelectedImageSize('');
    setSelectedText('');
    setMessages([]);
    setEditHistory([]);



    setStatus({ stage: 'rendering', message: 'Reading document\u2026' });

    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      let fileBuffer: ArrayBuffer;
      try {
        fileBuffer = await file.arrayBuffer();
      } catch (readErr) {
        console.error('[handleFileSelect] Failed to read file.arrayBuffer() on first attempt:', readErr);
        await new Promise((resolve) => setTimeout(resolve, 300));
        fileBuffer = await file.arrayBuffer();
      }

      if (!fileBuffer || fileBuffer.byteLength === 0) {
        console.error('[handleFileSelect] File buffer is empty or zero-length after reading.', {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        });
        throw new Error('File is empty or corrupted');
      }
      console.log('[handleFileSelect] Successfully read file buffer:', {
        fileName: file.name,
        byteLength: fileBuffer.byteLength,
        fileSize: file.size,
        fileType: file.type,
      });

      setStatus({ stage: 'parsing', message: 'Membaca struktur dokumen…' });
      const documentModel = await openEditableDocx(file, fileBuffer);

      documentRef.current = documentModel;
      const { segments: segs, fontFamily: sourceFont, images } = documentModel;
      segmentsRef.current = segs;
      imagesRef.current = images;
      setDocumentFont(sourceFont);
      logger.info('Document', `Document parsed with ${segs.length} segments and ${Object.keys(images).length} images`);

      setStatus({ stage: 'rendering', message: 'Rendering layout\u2026' });

      const container = viewerRef.current;

      if (container) {
        container.innerHTML = '';
        try {
          await renderDocx(file, container, fileBuffer);
          if (!sourceFont) {
            setDocumentFont(detectDocumentFont(container));
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
      } else {
        throw new Error('Elemen canvas viewer tidak dapat dimuat.');
      }


      if (documentRef.current) {
        const exported = await exportEditableDocx(documentRef.current);
        setCurrentBlob(exported);
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

          sessionStorage.setItem(`doculabai.activeDoc.${user.id}`, item.id);
        }
      }
    } catch (err) {
      console.error('[handleFileSelect] Parse error:', err);

      console.error('[handleFileSelect] Error details:', {
        name: err instanceof Error ? err.name : typeof err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });
      logger.error('Document', 'Failed to parse document', err);
      setStatus({
        stage: 'error',
        message: 'Could not read this file. Make sure it is a valid .docx.',
      });
      error('Gagal membaca dokumen. Pastikan file DOCX yang valid.');
    }
  }, [isAuthenticated, user.id, error]);


  const requestUpload = useCallback((file?: File, openPicker = true): boolean => {
    pendingFileRef.current = file || null;
    if (!isAuthenticated) {
      setIsLoginOpen(true);
      showAuthNotice({ type: 'error', message: 'Silakan login untuk mengunggah dokumen.' });
      return false;
    }
    if (isUsageLimitReached(user.id)) {
      setIsUpgradeOpen(true);
      return false;
    }
    if (file) {
      void handleFileSelect(file);
      return true;
    }
    if (openPicker && globalUploadInputRef.current) {
      globalUploadInputRef.current.click();
    }
    return true;
  }, [isAuthenticated, user.id, handleFileSelect, showAuthNotice]);

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
    setSelectedImageSize('');
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
        let localImageChange: LocalImageChange | undefined;
        if (referenceImage && promptRequestsTextToImage(prompt) && selectedText.trim()) {
          const target = currentSegments.find((segment) =>
            segment.type === 'paragraph' && segment.text.includes(selectedText.trim()),
          );
          if (target) {
            localImageChange = {
              kind: 'replace-text-with-image', segmentId: target.id, file: referenceImage,
              widthCm: requestedImageWidthCm(prompt),
            };
          }
        } else if (referenceImage && promptRequestsImageReplacement(prompt)) {
          const images = currentSegments.filter((segment) => segment.type === 'image');
          const target = selectedImageSegmentRef.current || (images.length === 1 ? images[0] : undefined);
          if (target) localImageChange = { kind: 'replace-image', segmentId: target.id, file: referenceImage };
        } else if (selectedImageSegmentRef.current && promptRequestsImageResize(prompt)) {
          localImageChange = {
            kind: 'resize-image', segmentId: selectedImageSegmentRef.current.id,
            widthCm: requestedImageWidthCm(prompt),
          };
        }

        abortControllerRef.current = new AbortController();
        setOperationProgress({ message: 'Memproses permintaan AI...', progress: 30 });

        const operationId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const response = await planDocumentEdit({
          documentText,
          segments: currentSegments,
          userPrompt: prompt,
          conversationHistory: messages,
          fileName: fileRef.current.name,
          fontFamily: fontFamily || undefined,
          operationId,
        }, abortControllerRef.current.signal);


        const proposalId = `msg_${Date.now()}_a`;
        const hasProposal = response.success && (
          response.edits.length > 0
          || (response.operations?.length ?? 0) > 0
          || Boolean(localImageChange)
        );
        const proposal: ChatMessage = {
          id: proposalId,
          role: 'assistant',
          content: hasProposal ? `${response.explanation} Tinjau perubahan ini sebelum menerapkannya.` : response.explanation,
          timestamp: Date.now(),
          action: response.action,
          diff: response.edits,
          operations: response.operations,
          recommendations: response.recommendations,
          reviewStatus: hasProposal ? 'pending' : undefined,
        };
        if (hasProposal) pendingChangesRef.current.set(proposalId, { response, localImageChange, referenceImage });
        setMessages((previous) => [...previous, proposal]);
        setOperationProgress({ message: 'Perubahan siap ditinjau', progress: 100 });
        logger.info('AI', `AI response proposed: ${response.edits.length} edits, ${response.operations?.length ?? 0} operations`);
        return;

        
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

    [messages, selectedText, selectedImage, isAuthenticated, user.id, scheduleAutosave, info],

  );

  const handleApproveProposal = useCallback(async (messageId: string) => {
    const pending = pendingChangesRef.current.get(messageId);
    const model = documentRef.current;
    const container = viewerRef.current;
    if (!pending || !model || !container) return;

    setIsThinking(true);
    setOperationProgress({ message: 'Applying approved change...', progress: 65 });
    try {
      const before = await exportEditableDocx(model);
      const appliedIds: string[] = [];
      const operationResults: import('@/types').OperationResult[] = [];

      if (pending.localImageChange) {
        const segment = model.segments.find((item) => item.id === pending.localImageChange?.segmentId);
        if (!segment) throw new Error('The selected document element is no longer available.');
        if (pending.localImageChange.kind === 'replace-image') {
          await replaceImageInDocx(model, segment, pending.localImageChange.file);
        } else if (pending.localImageChange.kind === 'replace-text-with-image') {
          await replaceTextWithImage(model, segment, pending.localImageChange.file, pending.localImageChange.widthCm);
        } else {
          await resizeImageInDocx(model, segment, pending.localImageChange.widthCm);
        }
        appliedIds.push(segment.id);
      }

      const imageTextEdits = pending.response.edits.filter((edit) => edit.action === 'replace_image_with_text');
      for (const edit of imageTextEdits) {
        const segment = model.segments.find((item) => item.id === edit.segmentId);
        if (segment) {
          await replaceImageWithText(model, segment, edit.after);
          appliedIds.push(segment.id);
        }
      }

      const uploadedImageEdits = pending.response.edits.filter((edit) => edit.action === 'replace_image_with_uploaded');
      for (const edit of uploadedImageEdits) {
        const segment = model.segments.find((item) => item.id === edit.segmentId);
        if (segment && pending.referenceImage) {
          await replaceImageInDocx(model, segment, pending.referenceImage);
          appliedIds.push(segment.id);
        }
      }

      const textEdits = pending.response.edits.filter((edit) => edit.action !== 'replace_image_with_text' && edit.action !== 'replace_image_with_uploaded');
      appliedIds.push(...await applyEditsToDocx(model, textEdits));

      for (const operation of pending.response.operations ?? []) {
        operationResults.push(await dispatchOperation(model, operation));
      }

      const changed = appliedIds.length > 0 || operationResults.some((result) => result.success);
      if (!changed) throw new Error('No proposed change could be applied safely.');

      const refreshed = await exportEditableDocx(model);
      container.innerHTML = '';
      await renderDocx(refreshed, container);
      animateEditedSegments(container, model.segments, [...new Set(appliedIds)]);
      setEditHistory((history) => [...history, { messageId, docx: before }]);
      segmentsRef.current = model.segments;
      imagesRef.current = model.images;
      setCurrentBlob(refreshed);
      if (currentHistoryIdRef.current) {
        void saveDocumentVersion(user.id, currentHistoryIdRef.current, pending.response.explanation, refreshed);
      }
      const nextCount = incrementUsageCount(user.id);
      setUsageCount(nextCount);
      scheduleAutosave(fileRef.current?.name);
      pendingChangesRef.current.delete(messageId);
      setMessages((previous) => previous.map((message) => message.id === messageId ? {
        ...message,
        applied: true,
        affectedSegments: [...new Set(appliedIds)],
        operationResults: operationResults.length ? operationResults : undefined,
        reviewStatus: 'approved',
      } : message));
      success('Approved change applied.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The approved change could not be applied.';
      logger.error('Document', 'Failed to apply approved proposal', err);
      error(message);
    } finally {
      setIsThinking(false);
      setOperationProgress(null);
    }
  }, [error, scheduleAutosave, success, user.id]);

  const handleDiscardProposal = useCallback((messageId: string) => {
    pendingChangesRef.current.delete(messageId);
    setMessages((previous) => previous.map((message) => message.id === messageId
      ? { ...message, reviewStatus: 'discarded' }
      : message));
  }, []);

  
  const handleAcceptRecommendation = useCallback(
    async (messageId: string, recommendation: AIRecommendation) => {
      if (!documentRef.current || !viewerRef.current) return;
      const model = documentRef.current;
      const opResults: import('@/types').OperationResult[] = [];

      if (recommendation.operations?.length) {
        for (const op of recommendation.operations) {
          const result = await dispatchOperation(model, op);
          opResults.push(result);
        }
      }

      let appliedIds: string[] = [];
      if (recommendation.edits?.length) {
        appliedIds = await applyEditsToDocx(model, recommendation.edits);
      }

      const changed = appliedIds.length > 0 || opResults.some((r) => r.success);
      if (changed) {
        const refreshed = await exportEditableDocx(model);
        viewerRef.current.innerHTML = '';
        await renderDocx(refreshed, viewerRef.current);
        segmentsRef.current = model.segments;
        scheduleAutosave(fileRef.current?.name);
      }

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.recommendations) return m;
          return {
            ...m,
            recommendations: m.recommendations.map((rec) =>
              rec.id === recommendation.id ? { ...rec, _accepted: true } : rec,
            ),
          };
        }),
      );

      if (changed) {
        success('Rekomendasi diterapkan.');
      }
    },
    [scheduleAutosave, success],
  );

  
  const handleDismissRecommendation = useCallback(
    (messageId: string, recommendationId: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.recommendations) return m;
          return {
            ...m,
            recommendations: m.recommendations.map((rec) =>
              rec.id === recommendationId ? { ...rec, _dismissed: true } : rec,
            ),
          };
        }),
      );
    },
    [],
  );

  const handleImageSelect = useCallback((image: HTMLImageElement) => {
    setSelectedImage((current) => {
      if (current && current !== image) current.classList.remove('image-selected');
      image.classList.add('image-selected');
      return image;
    });
    const foundSegment = documentRef.current
      ? findImageSegment(documentRef.current, image) || null
      : null;
    selectedImageSegmentRef.current = foundSegment;

    const displayWidth = image.width || image.naturalWidth;

    const displayHeight = image.height || image.naturalHeight;
    const widthCm = (displayWidth / 96) * 2.54;
    const heightCm = (displayHeight / 96) * 2.54;
    setSelectedImageSize(`${widthCm.toFixed(1)} × ${heightCm.toFixed(1)} cm`);


    setSelectedText('');
  }, []);

  const handleImageDeselect = useCallback(() => {
    setSelectedImage((current) => {
      if (current?.isConnected) current.classList.remove('image-selected');
      return null;
    });
    selectedImageSegmentRef.current = null;
    setSelectedImageSize('');
    setSelectedText('');
  }, []);



  const handleImageUpload = useCallback(async (file: File) => {
    if (!viewerRef.current) return;
    const model = documentRef.current;
    if (!model) return;
    const targetSegment = selectedImageSegmentRef.current
      || (selectedImage?.isConnected ? findImageSegment(model, selectedImage) : null)
      || model.segments.find((s) => s.type === 'image');
    if (targetSegment) {
      try {
        await replaceImageInDocx(model, targetSegment, file);
        imagesRef.current = model.images;
        segmentsRef.current = model.segments;
        const refreshed = await exportEditableDocx(model);
        viewerRef.current.innerHTML = '';
        await renderDocx(refreshed, viewerRef.current);
        if (viewerRef.current) animateImageReplaced(viewerRef.current, targetSegment);
        setSelectedImage(null);
        selectedImageSegmentRef.current = null;
        setSelectedImageSize('');
        setSelectedText('');
        success('Gambar berhasil diganti!');

      } catch (err) {
        console.error('Image replacement failed:', err);
        error('Gagal mengganti gambar. Pastikan gambar yang valid.');
      }
    } else {
      try {
        await addImageToDocx(model, file);
        imagesRef.current = model.images;
        segmentsRef.current = model.segments;
        const refreshed = await exportEditableDocx(model);
        viewerRef.current.innerHTML = '';
        await renderDocx(refreshed, viewerRef.current);
        success('Gambar berhasil ditambahkan!');
      } catch (err) {
        console.error('Image add failed:', err);
        error('Gagal menambahkan gambar.');
      }
    }
    scheduleAutosave(fileRef.current?.name);
  }, [selectedImage, scheduleAutosave, success, error]);


  const handleStructuredEdit = useCallback(async (edit: StructuredEdit) => {
    const model = documentRef.current;
    const container = viewerRef.current;
    if (!model || !container) return;

    setIsThinking(true);
    setOperationProgress({ message: 'Menerapkan perubahan...', progress: 40 });
    try {
      const before = await exportEditableDocx(model);
      const segment = model.segments.find((item) => item.id === edit.segmentId);
      if (!segment) throw new Error('Elemen dokumen yang dipilih sudah tidak tersedia.');

      let description = '';
      if (edit.kind === 'replace-image-with-text') {
        await replaceImageWithText(model, segment, edit.text);
        if (edit.fontFamily || edit.fontSize !== undefined || edit.bold !== undefined || edit.italic !== undefined) {
          await applyTextFormatting(model, segment, {
            fontFamily: edit.fontFamily,
            fontSize: edit.fontSize,
            bold: edit.bold,
            italic: edit.italic,
          });
        }
        description = `Gambar diganti menjadi teks: "${edit.text}"`;
      } else if (edit.kind === 'replace-image-with-table') {
        await replaceImageWithTable(model, segment, edit.rows, edit.cols, edit.cells);
        description = `Gambar diganti menjadi tabel ${edit.rows}×${edit.cols}`;
      } else {
        await replaceImageInDocx(model, segment, edit.file);
        description = `Gambar diganti dengan "${edit.file.name}"`;
      }

      const refreshed = await exportEditableDocx(model);
      container.innerHTML = '';
      await renderDocx(refreshed, container);
      segmentsRef.current = model.segments;
      imagesRef.current = model.images;
      setCurrentBlob(refreshed);
      setEditHistory((history) => [...history, { messageId: `structured_${Date.now()}`, docx: before }]);
      if (currentHistoryIdRef.current) {
        void saveDocumentVersion(user.id, currentHistoryIdRef.current, description, refreshed);
      }
      const nextCount = incrementUsageCount(user.id);
      setUsageCount(nextCount);
      scheduleAutosave(fileRef.current?.name);
      setSelectedImage(null);
      selectedImageSegmentRef.current = null;
      setSelectedImageSize('');
      success(description);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Perubahan tidak dapat diterapkan.';
      logger.error('Document', 'Failed to apply structured edit', err);
      error(message);
    } finally {
      setIsThinking(false);
      setOperationProgress(null);
    }
  }, [error, scheduleAutosave, success, user.id]);


  const handleRevert = useCallback(
    async (messageId: string) => {

      const historyItem = [...editHistory]
        .reverse()
        .find((h) => h.messageId === messageId);
      if (historyItem && viewerRef.current) {
        try {
          const restoredModel = await openEditableDocx(historyItem.docx);
          viewerRef.current.innerHTML = '';
          await renderDocx(historyItem.docx, viewerRef.current);
          documentRef.current = restoredModel;
          segmentsRef.current = restoredModel.segments;
          imagesRef.current = restoredModel.images;
          setCurrentBlob(historyItem.docx);
          setEditHistory((history) => history.filter((item) => item.messageId !== messageId));
          scheduleAutosave(fileRef.current?.name);
          success('The document was restored to its state before this change.');
        } catch (err) {
          logger.error('Document', 'Failed to revert document', err);
          error('Could not restore the previous document version.');
          return;
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
    [editHistory, error, scheduleAutosave, success],
  );

  const handleDownload = useCallback(async (format: 'docx' | 'pdf' = 'docx') => {
    if (!documentRef.current || !fileName) return;
    setIsDownloading(true);
    try {
      if (format === 'pdf') {

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
        const blob = await exportEditableDocx(documentRef.current, { watermark: true });
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isReady && fileRef.current) {
          void handleDownload();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (editHistory.length > 0) {
          const lastHistory = editHistory[editHistory.length - 1];
          handleRevert(lastHistory.messageId);
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();

      }

      if (e.key === 'Escape') {
        if (selectedImage?.isConnected) {
          selectedImage.classList.remove('image-selected');
          setSelectedImage(null);
          selectedImageSegmentRef.current = null;
          setSelectedImageSize('');
        }

        if (isLoginOpen) setIsLoginOpen(false);
        if (isUpgradeOpen) setIsUpgradeOpen(false);
        if (isProfileOpen) setIsProfileOpen(false);
        if (isSidebarOpen) setIsSidebarOpen(false);
        if (isChatOpen) setIsChatOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReady, editHistory, selectedImage, isLoginOpen, isUpgradeOpen, isProfileOpen, isSidebarOpen, isChatOpen, handleDownload, handleRevert]);


  const overlays = (
    <>
      <DashboardSidebar
        open={isSidebarOpen}
        user={user}
        usageCount={usageCount}
        history={documentHistory}
        trashItems={trashItems}
        onDeleteHistoryItem={handleDeleteHistoryItem}
        onRestoreTrashItem={handleRestoreTrashItem}
        onPermanentDeleteTrashItem={handlePermanentDeleteTrashItem}
        onClose={() => setIsSidebarOpen(false)}
        onUpload={() => {
          requestUpload();
          setIsSidebarOpen(false);
        }}
        onOpenTemplates={() => { setIsSidebarOpen(false); setIsTemplatesOpen(true); }}
        onOpenVersionHistory={() => {
          if (!currentHistoryIdRef.current) {
            info('Buka dokumen terlebih dahulu untuk melihat riwayat versi.');
            return;
          }
          setIsSidebarOpen(false);
          setIsVersionHistoryOpen(true);
        }}
        onHistorySelect={handleHistorySelect}
        onProfileSettings={() => { setIsSidebarOpen(false); setIsProfileOpen(true); }}
        onLogout={handleLogout}
      />
      {isLoginOpen && <LoginModal onClose={() => setIsLoginOpen(false)} onSuccess={handleLoginSuccess} />}
      {isUpgradeOpen && <UpgradeModal onClose={() => setIsUpgradeOpen(false)} />}
      {isProfileOpen && <ProfileModal user={user} theme={theme} onClose={() => setIsProfileOpen(false)} onLogout={handleLogout} onSave={(nextUser, nextTheme, birthDate) => { setUser(nextUser); setTheme(nextTheme); localStorage.setItem('doculabai.birthDate', birthDate); void supabase?.auth.updateUser({ data: { full_name: nextUser.name, avatar_url: nextUser.avatar, birth_date: birthDate, profile_completed: true } }); setIsProfileOpen(false); showAuthNotice({ type: 'success', message: 'Profil berhasil disimpan.' }); }} />}
      {isVersionHistoryOpen && currentHistoryIdRef.current && (
        <VersionHistoryModal
          userId={user.id}
          documentId={currentHistoryIdRef.current}
          documentName={fileName || 'Dokumen'}
          onClose={() => setIsVersionHistoryOpen(false)}
          onRestoreVersion={(blob, summary) => {
            if (fileName) {
              const restoredFile = new File([blob], fileName);
              void handleFileSelect(restoredFile, { historyId: currentHistoryIdRef.current || undefined });
              success(summary);
            }
          }}
        />
      )}
      {isTemplatesOpen && (
        <TemplateModal
          userId={user.id}
          currentDocumentBlob={currentBlob}
          currentDocumentName={fileName}
          onClose={() => setIsTemplatesOpen(false)}
          onSelectTemplate={(templateFile) => {
            void handleFileSelect(templateFile);
            success(`Template "${templateFile.name}" berhasil dimuat.`);
          }}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {operationProgress && <ProgressBar message={operationProgress.message} progress={operationProgress.progress} />}

      <input
        ref={globalUploadInputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) requestUpload(file, false);
          event.target.value = '';
        }}
      />
    </>
  );

  if (status.stage === 'idle' || status.stage === 'error') {
    return (
      <ErrorBoundary>
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
            saveStatus={saveStatus}
            usageCount={usageCount}
          />
          <LandingPage
            onFileSelect={handleFileSelect}
            onRequestUpload={requestUpload}
            isLoading={false}
            statusMessage={status.message}
            isAuthenticated={isAuthenticated}
            onRequireLogin={() => {
              setIsLoginOpen(true);
              showAuthNotice({ type: 'error', message: 'Silakan login untuk mengunggah dokumen.' });
            }}
          />

          {status.stage === 'error' && (
            <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-error-500 px-5 py-3 text-sm font-semibold text-white shadow-elevated animate-fade-in-up">
              {status.message}
            </div>
          )}
          {overlays}
        </div>
      </ErrorBoundary>
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
        onRequestUpload={requestUpload}
        onLogoClick={() => setIsSidebarOpen(true)}
        user={isAuthenticated ? user : undefined}
        onProfileClick={() => setIsProfileOpen(true)}
        saveStatus={saveStatus}
        usageCount={usageCount}
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
              isRendering={status.stage === 'rendering' || status.stage === 'parsing'}
              statusMessage={status.message || 'Memproses dokumen...'}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onTextSelect={setSelectedText}
              onImageUpload={handleImageUpload}
              onImageSelect={handleImageSelect}
              onImageDeselect={handleImageDeselect}
              imageSelected={Boolean(selectedImage?.isConnected)}
              selectedImageSize={selectedImageSize}
            />


          </Suspense>
        </div>

        {/* Desktop: persistent AI Assistant sidebar */}
        <div className="hidden w-[400px] shrink-0 max-lg:w-[340px] md:block">
          <Suspense fallback={<ChatSkeleton />}>
            <ChatPanel
              messages={messages}
              onSend={handleSendPrompt}
              isThinking={isThinking}
              onRevert={handleRevert}
              onApprove={handleApproveProposal}
              onDiscard={handleDiscardProposal}
              onAcceptRecommendation={handleAcceptRecommendation}
              onDismissRecommendation={handleDismissRecommendation}
              canChat={isAuthenticated}
              onRequireLogin={() => { setIsLoginOpen(true); showAuthNotice({ type: 'error', message: 'Silakan login untuk mengirim pesan.' }); }}
              canRevert={editHistory.length > 0}
              documentFont={documentFont}
              prefillPrompt={selectedText}
              imageSegments={segmentsRef.current.filter((s) => s.type === 'image')}
              imagesMap={imagesRef.current}
              selectedImageSegment={selectedImageSegmentRef.current}
              onStructuredEdit={handleStructuredEdit}
            />

          </Suspense>
        </div>
      </div>

      {/* Mobile: Floating Action Button for AI Assistant */}
      <button
        type="button"
        onClick={() => setIsChatOpen(true)}
        className="ai-fab md:hidden"
        aria-label="Open AI Assistant"
        title="AI Assistant"
      >
        <span className="ai-fab__icon" aria-hidden="true">
          <Sparkles className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="ai-fab__label">AI Assistant</span>
      </button>


      {/* Mobile: Slide-over drawer for AI Assistant */}
      <div
        className={`ai-drawer-backdrop md:hidden ${isChatOpen ? 'ai-drawer-backdrop--open' : ''}`}
        onClick={() => setIsChatOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`ai-drawer md:hidden ${isChatOpen ? 'ai-drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="AI Assistant"
      >
        <div className="ai-drawer__handle" />
        <div className="ai-drawer__header">
          <div className="flex items-center gap-2.5">
            <div className="chat-icon flex h-8 w-8 items-center justify-center rounded-xl" aria-hidden="true">
              <Sparkles className="h-4 w-4" strokeWidth={1.8} />
            </div>
            <div>
              <p className="m-0 text-sm font-semibold text-white">AI Assistant</p>
              <p className="pixel-label m-0 mt-0.5 text-[10px] tracking-[.11em] text-primary-100/55">DOCUMENT COPILOT</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsChatOpen(false)}
            className="ai-drawer__close"
            aria-label="Close AI Assistant"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="ai-drawer__body">
          <Suspense fallback={<ChatSkeleton />}>
            <ChatPanel
              messages={messages}
              onSend={handleSendPrompt}
              isThinking={isThinking}
              onRevert={handleRevert}
              onApprove={handleApproveProposal}
              onDiscard={handleDiscardProposal}
              onAcceptRecommendation={handleAcceptRecommendation}
              onDismissRecommendation={handleDismissRecommendation}
              canChat={isAuthenticated}
              onRequireLogin={() => { setIsLoginOpen(true); showAuthNotice({ type: 'error', message: 'Silakan login untuk mengirim pesan.' }); }}
              canRevert={editHistory.length > 0}
              documentFont={documentFont}
              prefillPrompt={selectedText}
              imageSegments={segmentsRef.current.filter((s) => s.type === 'image')}
              imagesMap={imagesRef.current}
              selectedImageSegment={selectedImageSegmentRef.current}
              onStructuredEdit={handleStructuredEdit}
            />
          </Suspense>
        </div>
      </div>
      {overlays}
    </div>
    </ErrorBoundary>
  );
}

