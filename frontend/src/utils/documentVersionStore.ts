export interface DocumentVersionItem {
  id: string;
  documentId: string;
  userId: string;
  versionNumber: number;
  summary: string;
  timestamp: number;
  formattedDate: string;
  blob: Blob;
}

const DB_NAME = 'doculabai-versions';
const DB_VERSION = 1;
const STORE = 'versions';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('documentId', 'documentId', { unique: false });
        store.createIndex('userDoc', ['userId', 'documentId'], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDocumentVersion(
  userId: string,
  documentId: string,
  summary: string,
  blob: Blob,
): Promise<DocumentVersionItem> {
  const versions = await listVersionsForDocument(userId, documentId);
  const nextVersionNumber = versions.length + 1;

  const versionItem: DocumentVersionItem = {
    id: `ver_${userId}_${documentId}_v${nextVersionNumber}_${Date.now()}`,
    documentId,
    userId,
    versionNumber: nextVersionNumber,
    summary: summary || `Versi ${nextVersionNumber}`,
    timestamp: Date.now(),
    formattedDate: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
    blob,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(versionItem);
  });
  db.close();

  return versionItem;
}

export async function listVersionsForDocument(
  userId: string,
  documentId: string,
): Promise<DocumentVersionItem[]> {
  const db = await openDb();
  const records = await new Promise<DocumentVersionItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('userDoc');
    const request = index.getAll([userId, documentId]);
    request.onsuccess = () => resolve((request.result as DocumentVersionItem[]) || []);
    request.onerror = () => reject(request.error);
  });
  db.close();

  return records.sort((a, b) => b.versionNumber - a.versionNumber);
}

export async function getVersionBlob(
  userId: string,
  versionId: string,
): Promise<Blob | null> {
  const db = await openDb();
  const record = await new Promise<DocumentVersionItem | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(versionId);
    request.onsuccess = () => resolve(request.result as DocumentVersionItem | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();

  if (!record || record.userId !== userId) return null;
  return record.blob;
}

export async function deleteVersionsForDocument(
  userId: string,
  documentId: string,
): Promise<void> {
  const versions = await listVersionsForDocument(userId, documentId);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    versions.forEach((ver) => store.delete(ver.id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
