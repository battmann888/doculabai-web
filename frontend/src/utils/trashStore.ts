export interface TrashItem {
  id: string;
  userId: string;
  name: string;
  meta: string;
  deletedAt: number;
  blob: Blob;
}

const DB_NAME = 'doculabai-trash';
const DB_VERSION = 1;
const STORE = 'trash';

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

export async function moveDocumentToTrash(
  userId: string,
  itemId: string,
  name: string,
  meta: string,
  blob: Blob,
): Promise<TrashItem> {
  const trashItem: TrashItem = {
    id: itemId,
    userId,
    name,
    meta: `Dihapus ${new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`,
    deletedAt: Date.now(),
    blob,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(trashItem);
  });
  db.close();

  return trashItem;
}

export async function listTrashForUser(userId: string): Promise<TrashItem[]> {
  const db = await openDb();
  const records = await new Promise<TrashItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('userId');
    const request = index.getAll(userId);
    request.onsuccess = () => resolve((request.result as TrashItem[]) || []);
    request.onerror = () => reject(request.error);
  });
  db.close();

  return records.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function restoreDocumentFromTrash(
  userId: string,
  itemId: string,
): Promise<TrashItem | null> {
  const db = await openDb();
  const record = await new Promise<TrashItem | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(itemId);
    request.onsuccess = () => resolve(request.result as TrashItem | undefined);
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

export async function deletePermanentlyFromTrash(
  userId: string,
  itemId: string,
): Promise<boolean> {
  const db = await openDb();
  const record = await new Promise<TrashItem | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(itemId);
    request.onsuccess = () => resolve(request.result as TrashItem | undefined);
    request.onerror = () => reject(request.error);
  });

  if (!record || record.userId !== userId) {
    db.close();
    return false;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(itemId);
  });
  db.close();

  return true;
}
