const DB_NAME = 'doculabai-templates';
const DB_VERSION = 1;
const STORE = 'templates';

export interface DocumentTemplateItem {
  id: string;
  userId: string;
  name: string;
  description: string;
  createdAt: number;
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

export async function saveTemplate(
  userId: string,
  name: string,
  description: string,
  blob: Blob,
): Promise<DocumentTemplateItem> {
  const item: DocumentTemplateItem = {
    id: `${userId}-template-${Date.now()}-${name}`,
    userId,
    name,
    description: description || 'Custom document template',
    createdAt: Date.now(),
    blob,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(item);
  });
  db.close();
  return item;
}

export async function listTemplatesForUser(userId: string): Promise<DocumentTemplateItem[]> {
  const db = await openDb();
  const records = await new Promise<DocumentTemplateItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('userId');
    const request = index.getAll(userId);
    request.onsuccess = () => resolve((request.result as DocumentTemplateItem[]) || []);
    request.onerror = () => reject(request.error);
  });
  db.close();

  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteTemplate(userId: string, templateId: string): Promise<boolean> {
  const db = await openDb();
  const record = await new Promise<DocumentTemplateItem | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(templateId);
    request.onsuccess = () => resolve(request.result as DocumentTemplateItem | undefined);
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
    tx.objectStore(STORE).delete(templateId);
  });
  db.close();
  return true;
}
