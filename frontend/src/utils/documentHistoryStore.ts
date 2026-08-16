import type { DocumentHistoryItem } from '@/components/DashboardSidebar';

const DB_NAME = 'doculabai-documents';
const DB_VERSION = 1;
const STORE = 'documents';

interface StoredDocument {
  id: string;
  userId: string;
  name: string;
  meta: string;
  savedAt: number;
  blob: Blob;
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDocumentToHistory(
  userId: string,
  file: File,
  blob: Blob,
): Promise<DocumentHistoryItem> {
  const savedAt = Date.now();
  const item: DocumentHistoryItem = {
    id: `${userId}-${savedAt}-${file.name}`,
    name: file.name,
    meta: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
    savedAt,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put({
      id: item.id,
      userId,
      name: file.name,
      meta: item.meta,
      savedAt,
      blob,
    } satisfies StoredDocument);
  });
  db.close();
  return item;
}

export async function loadDocumentFromHistory(userId: string, itemId: string): Promise<File | null> {
  const db = await openDb();
  const record = await new Promise<StoredDocument | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(itemId);
    request.onsuccess = () => resolve(request.result as StoredDocument | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();

  if (!record || record.userId !== userId) return null;
  return new File([record.blob], record.name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export async function listHistoryForUser(userId: string): Promise<DocumentHistoryItem[]> {
  const db = await openDb();
  const records = await new Promise<StoredDocument[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('userId');
    const request = index.getAll(userId);
    request.onsuccess = () => resolve((request.result as StoredDocument[]) || []);
    request.onerror = () => reject(request.error);
  });
  db.close();

  return records
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 20)
    .map((record) => ({ id: record.id, name: record.name, meta: record.meta, savedAt: record.savedAt }));
}

export async function updateDocumentInHistory(
  userId: string,
  itemId: string,
  blob: Blob,
  name?: string,
): Promise<DocumentHistoryItem | null> {
  const db = await openDb();
  const record = await new Promise<StoredDocument | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(itemId);
    request.onsuccess = () => resolve(request.result as StoredDocument | undefined);
    request.onerror = () => reject(request.error);
  });

  if (!record || record.userId !== userId) {
    db.close();
    return null;
  }

  const meta = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  const updated: StoredDocument = {
    ...record,
    name: name || record.name,
    meta,
    savedAt: Date.now(),
    blob,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(updated);
  });
  db.close();

  return { id: updated.id, name: updated.name, meta: updated.meta, savedAt: updated.savedAt };
}

export async function clearHistoryForUser(userId: string): Promise<void> {
  const db = await openDb();
  const records = await new Promise<StoredDocument[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).index('userId').getAll(userId);
    request.onsuccess = () => resolve((request.result as StoredDocument[]) || []);
    request.onerror = () => reject(request.error);
  });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE);
    records.forEach((record) => store.delete(record.id));
  });
  db.close();
}

export async function deleteDocumentFromHistory(userId: string, itemId: string): Promise<StoredDocument | null> {
  const db = await openDb();
  const record = await new Promise<StoredDocument | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(itemId);
    request.onsuccess = () => resolve(request.result as StoredDocument | undefined);
    request.onerror = () => reject(request.error);
  });

  if (!record || record.userId !== userId) {
    db.close();
    return null;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(itemId);
  });
  db.close();

  return record;
}
