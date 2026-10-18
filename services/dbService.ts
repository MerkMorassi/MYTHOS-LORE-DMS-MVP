import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ChatMessage, FileGroup, ChatSession, ApiKeyEntry, AppSettings } from '../types';

interface AppDB extends DBSchema {
  fileGroups: {
    key: string;
    value: FileGroup;
  };
  chatMessages: {
    key: string;
    value: ChatMessage;
    indexes: { 'by-timestamp': Date };
  };
  chatSessions: {
    key: string;
    value: ChatSession;
    indexes: { 'by-updatedAt': Date };
  };
  apiKeys: {
    key: string;
    value: ApiKeyEntry;
    indexes: { 'by-createdAt': string };
  };
  appSettings: {
    key: string;
    value: { id: string; settings: AppSettings };
  };
}

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>('doc-browser-db', 3, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('fileGroups', { keyPath: 'id' });
          const chatStore = db.createObjectStore('chatMessages', { keyPath: 'id' });
          chatStore.createIndex('by-timestamp', 'timestamp');
        }
        if (oldVersion < 2) {
          const sessionStore = db.createObjectStore('chatSessions', { keyPath: 'id' });
          sessionStore.createIndex('by-updatedAt', 'updatedAt');
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('apiKeys')) {
            const keyStore = db.createObjectStore('apiKeys', { keyPath: 'id' });
            keyStore.createIndex('by-createdAt', 'createdAt');
          }
          if (!db.objectStoreNames.contains('appSettings')) {
            db.createObjectStore('appSettings', { keyPath: 'id' });
          }
        }
      },
    });
  }
  return dbPromise;
};

export const saveFileGroups = async (groups: FileGroup[]) => {
  const db = await getDB();
  const tx = db.transaction('fileGroups', 'readwrite');
  await Promise.all([
    tx.store.clear(),
    ...groups.map(group => tx.store.put(group))
  ]);
  await tx.done;
};

export const loadFileGroups = async (): Promise<FileGroup[]> => {
  const db = await getDB();
  return db.getAll('fileGroups');
};

export const saveChatMessages = async (messages: ChatMessage[]) => {
  const db = await getDB();
  const tx = db.transaction('chatMessages', 'readwrite');
  await Promise.all([
    tx.store.clear(),
    ...messages.map(msg => tx.store.put(msg))
  ]);
  await tx.done;
};

export const loadChatMessages = async (): Promise<ChatMessage[]> => {
  const db = await getDB();
  return db.getAllFromIndex('chatMessages', 'by-timestamp');
};

export const saveChatSession = async (session: ChatSession) => {
  const db = await getDB();
  await db.put('chatSessions', session);
};

export const loadChatSessions = async (): Promise<ChatSession[]> => {
  const db = await getDB();
  const sessions = await db.getAllFromIndex('chatSessions', 'by-updatedAt');
  return sessions.reverse(); // Newest first
};

export const deleteChatSession = async (id: string) => {
  const db = await getDB();
  await db.delete('chatSessions', id);
};

// --- API Keys Management in IndexedDB ---
export const saveApiKey = async (apiKeyEntry: ApiKeyEntry): Promise<void> => {
  const db = await getDB();
  // If set to active, ensure other keys are marked inactive in same transaction
  if (apiKeyEntry.isActive) {
    const tx = db.transaction('apiKeys', 'readwrite');
    const existingKeys = await tx.store.getAll();
    for (const k of existingKeys) {
      if (k.id !== apiKeyEntry.id && k.isActive) {
        k.isActive = false;
        await tx.store.put(k);
      }
    }
    await tx.store.put(apiKeyEntry);
    await tx.done;
  } else {
    await db.put('apiKeys', apiKeyEntry);
  }
};

export const loadApiKeys = async (): Promise<ApiKeyEntry[]> => {
  const db = await getDB();
  const keys = await db.getAll('apiKeys');
  // Sort newest first
  return keys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const deleteApiKey = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.delete('apiKeys', id);
};

export const setActiveApiKeyInDB = async (id: string | null): Promise<void> => {
  const db = await getDB();
  const tx = db.transaction('apiKeys', 'readwrite');
  const existingKeys = await tx.store.getAll();
  for (const k of existingKeys) {
    k.isActive = k.id === id;
    await tx.store.put(k);
  }
  await tx.done;
};

// --- Settings Management in IndexedDB ---
export const saveAppSettingsToDB = async (settings: AppSettings): Promise<void> => {
  const db = await getDB();
  await db.put('appSettings', { id: 'current', settings });
};

export const loadAppSettingsFromDB = async (): Promise<AppSettings | null> => {
  const db = await getDB();
  const record = await db.get('appSettings', 'current');
  return record ? record.settings : null;
};

// --- Pinned Chat Messages in IndexedDB ---
export const toggleChatMessagePinInDB = async (messageId: string, isPinned: boolean): Promise<void> => {
  const db = await getDB();
  const msg = await db.get('chatMessages', messageId);
  if (msg) {
    msg.isPinned = isPinned;
    msg.pinnedAt = isPinned ? new Date().toISOString() : undefined;
    await db.put('chatMessages', msg);
  }
};

export const loadPinnedChatMessages = async (): Promise<ChatMessage[]> => {
  const messages = await loadChatMessages();
  return messages.filter(m => m.isPinned);
};
