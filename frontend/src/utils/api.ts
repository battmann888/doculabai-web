import type { AIEditRequest, AIEditResponse, DocSegment } from '@/types';

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
const API_BASE_URL = configuredBaseUrl
  || (import.meta.env.DEV ? 'http://localhost:8000' : '');



const REQUEST_TIMEOUT_MS = 100_000;

export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  ai_unavailable: 'Asisten AI belum siap. Coba muat ulang halaman beberapa saat lagi.',
  ai_processing_failed: 'Asisten AI sedang sibuk. Silakan coba lagi dalam beberapa saat.',
  ai_invalid_response: 'Asisten AI belum dapat menyusun perubahan yang aman. Coba tuliskan target perubahan dengan lebih spesifik.',
  invalid_ai_plan: 'AIDOCU tidak menerapkan rencana yang belum aman. Coba sebutkan teks atau elemen yang ingin diubah.',
  document_not_found: 'Sesi dokumen sudah tidak tersedia. Unggah dokumen lagi untuk melanjutkan.',
  unsupported_file: 'Pilih file Word berformat DOCX yang valid.',
  invalid_docx: 'Dokumen tidak dapat dibaca. Pastikan file DOCX tidak rusak dan coba lagi.',
  file_too_large: 'Ukuran dokumen melebihi batas unggahan. Gunakan file yang lebih kecil.',
};

function compactPlannerPayload(payload: AIEditRequest): AIEditRequest {
  const allowedMeta = new Set(['level', 'rows', 'cols', 'style', 'location', 'imagePath', 'widthCm', 'heightCm', 'cells']);

  return {
    ...payload,
    segments: payload.segments.map((segment) => ({

      id: segment.id,
      type: segment.type,
      text: segment.text.slice(0, 8_000),
      position: segment.position,
      meta: Object.fromEntries(Object.entries(segment.meta ?? {}).filter(([key]) => allowedMeta.has(key))),
    })),
  };
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const cancelFromCaller = () => timeout.abort();
  signal?.addEventListener('abort', cancelFromCaller, { once: true });
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, signal: timeout.signal });
  } catch (cause) {
    if (timeout.signal.aborted) {
      if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      throw new ApiError('request_timeout', 'Asisten membutuhkan waktu terlalu lama. Silakan coba lagi.', 408);
    }
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('network_error', 'Tidak dapat terhubung ke AIDOCU API. Pastikan backend berjalan.', 0);
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', cancelFromCaller);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const code = detail?.code || 'request_failed';
    throw new ApiError(code, FRIENDLY_ERROR_MESSAGES[code] || detail?.message || 'Permintaan belum dapat diselesaikan. Silakan coba lagi.', response.status);
  }
  return response.json() as Promise<T>;
}

export interface UploadedDocument {
  document_id: string;
  file_name: string;
  version: number;
  segments: DocSegment[];
  image_count: number;
}

export function uploadDocument(file: File, signal?: AbortSignal) {
  const formData = new FormData();
  formData.set('file', file);
  return request<UploadedDocument>('/api/documents/upload', { method: 'POST', body: formData }, signal);
}

export function planDocumentEdit(documentId: string, payload: AIEditRequest, signal?: AbortSignal) {
  return request<AIEditResponse>(`/api/documents/${encodeURIComponent(documentId)}/edit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(compactPlannerPayload(payload)),
  }, signal);
}
