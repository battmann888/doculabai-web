import type { AIEditRequest, AIEditResponse } from '@/types';
import { getAccessToken } from '@/utils/supabase';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function authHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function sendEditCommand(
  payload: AIEditRequest,
  signal?: AbortSignal,
): Promise<AIEditResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const timeoutController = new AbortController();
      const timeoutId = window.setTimeout(() => timeoutController.abort(), 65_000);
      const requestSignal = signal
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal;

      const res = await fetch(`${API_BASE}/api/edit`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(payload),
        signal: requestSignal,
      });

      window.clearTimeout(timeoutId);

      if (res.status === 401) {
        throw new Error('Sesi berakhir. Silakan login kembali.');
      }
      if (res.status === 429) {
        throw new Error('Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.');
      }
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to process edit request');
      }

      return res.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on client-side errors (4xx) or abort errors
      if (lastError.message.includes('Sesi berakhir') || 
          lastError.message.includes('429') ||
          (error instanceof DOMException && error.name === 'AbortError')) {
        throw lastError;
      }

      // Retry on server errors (5xx) or network issues
      if (attempt < MAX_RETRIES) {
        console.warn(`Request failed (attempt ${attempt}/${MAX_RETRIES}), retrying...`, lastError.message);
        await sleep(RETRY_DELAY * attempt);
      }
    }
  }

  throw lastError || new Error('Failed to process edit request after retries');
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
