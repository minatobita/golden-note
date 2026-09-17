import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { SEED_PHRASES } from './seed-data';
import { Phrase, Batch, UserSettings, DEFAULT_SETTINGS } from './types';

// ============ Seed ============

export async function seedIfNeeded(userId: string): Promise<void> {
  const q = query(collection(db, 'phrases'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) return; // already seeded

  const batch_size = 50;
  for (let i = 0; i < SEED_PHRASES.length; i += batch_size) {
    const chunk = SEED_PHRASES.slice(i, i + batch_size);
    const promises = chunk.map((phrase) =>
      addDoc(collection(db, 'phrases'), {
        ...phrase,
        userId,
        status: phrase.english ? 'translated' : 'untranslated',
        createdAt: Timestamp.now(),
      })
    );
    await Promise.all(promises);
  }
}

// ============ Phrases ============

export async function getPhrases(userId: string): Promise<(Phrase & { id: string })[]> {
  const q = query(collection(db, 'phrases'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  const phrases = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Phrase & { id: string }));
  // Sort client-side to avoid composite index requirement
  phrases.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime; // descending
  });
  return phrases;
}

export async function addPhrase(userId: string, phrase: Partial<Phrase>): Promise<string> {
  const docRef = await addDoc(collection(db, 'phrases'), {
    ...phrase,
    userId,
    status: phrase.english ? 'translated' : 'untranslated',
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function updatePhrase(phraseId: string, data: Partial<Phrase>): Promise<void> {
  await updateDoc(doc(db, 'phrases', phraseId), data);
}

export async function deletePhrase(phraseId: string): Promise<void> {
  await deleteDoc(doc(db, 'phrases', phraseId));
}

// ============ Collecting (cross-device sync) ============

interface CollectPhrase {
  japanese: string;
  english: string;
  situation: string;
  isAI?: boolean;
}

export async function getCollecting(userId: string): Promise<CollectPhrase[]> {
  const docSnap = await getDoc(doc(db, 'collecting', userId));
  if (!docSnap.exists()) return [];
  const data = docSnap.data();
  return data.phrases || [];
}

export async function saveCollecting(userId: string, phrases: CollectPhrase[]): Promise<void> {
  await setDoc(doc(db, 'collecting', userId), {
    phrases,
    updatedAt: Timestamp.now(),
  });
}

export async function clearCollecting(userId: string): Promise<void> {
  await deleteDoc(doc(db, 'collecting', userId));
}

// ============ Batches ============

export async function getBatches(userId: string): Promise<(Batch & { id: string })[]> {
  const q = query(collection(db, 'batches'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  const batches = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Batch & { id: string }));
  // Sort client-side to avoid composite index requirement
  batches.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime; // descending
  });
  return batches;
}

export async function createBatch(userId: string, phrases: { japanese: string; english: string; situation?: string }[]): Promise<string> {
  if (!phrases || phrases.length === 0) {
    throw new Error('No phrases provided');
  }
  const docRef = await addDoc(collection(db, 'batches'), {
    userId,
    phrases,
    stage: 'bronze_25_18',
    noteLevel: 'bronze',
    totalPhrases: phrases.length,
    targetCount: 18,
    status: 'translating',
    reviewHistory: [],
    createdAt: Timestamp.now(),
    nextReviewDate: null,
    lastReviewDate: null,
    intervalDays: 0,
  });
  return docRef.id;
}

export async function updateBatch(batchId: string, data: Partial<Batch>): Promise<void> {
  await updateDoc(doc(db, 'batches', batchId), data);
}

export async function getBatch(batchId: string): Promise<(Batch & { id: string }) | null> {
  const docSnap = await getDoc(doc(db, 'batches', batchId));
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Batch & { id: string };
}

export async function deleteBatch(batchId: string): Promise<void> {
  await deleteDoc(doc(db, 'batches', batchId));
}

// ============ Settings ============

export async function getSettings(userId: string): Promise<UserSettings> {
  const docSnap = await getDoc(doc(db, 'settings', userId));
  if (!docSnap.exists()) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...docSnap.data() } as UserSettings;
}

export async function saveSettings(userId: string, settings: Partial<UserSettings>): Promise<void> {
  await setDoc(doc(db, 'settings', userId), settings, { merge: true });
}

// ============ Analysis Cache ============

export async function getAnalysis(userId: string): Promise<any | null> {
  const docSnap = await getDoc(doc(db, 'analysis', userId));
  if (!docSnap.exists()) return null;
  return docSnap.data();
}

export async function saveAnalysis(userId: string, data: any): Promise<void> {
  await setDoc(doc(db, 'analysis', userId), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}
