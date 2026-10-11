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

function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ============ Seed ============

export async function seedIfNeeded(userId: string): Promise<void> {
  const q = query(collection(db, 'phrases'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) return;

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

export async function getPhrases(userId: string) {
  const q = query(collection(db, 'phrases'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  const phrases = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  phrases.sort((a: any, b: any) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
  return phrases;
}

export async function addPhrase(userId: string, phrase: any): Promise<string> {
  const docRef = await addDoc(collection(db, 'phrases'), {
    ...phrase,
    userId,
    status: phrase.english ? 'translated' : 'untranslated',
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function updatePhrase(phraseId: string, data: any): Promise<void> {
  await updateDoc(doc(db, 'phrases', phraseId), data);
}

export async function deletePhrase(phraseId: string): Promise<void> {
  await deleteDoc(doc(db, 'phrases', phraseId));
}

// ============ Collecting (cross-device sync) ============

export async function getCollecting(userId: string): Promise<any[]> {
  const docSnap = await getDoc(doc(db, 'collecting', userId));
  if (!docSnap.exists()) return [];
  return docSnap.data().phrases || [];
}

export async function saveCollecting(userId: string, phrases: any[]): Promise<void> {
  await setDoc(doc(db, 'collecting', userId), {
    phrases,
    updatedAt: Timestamp.now(),
  });
}

export async function clearCollecting(userId: string): Promise<void> {
  await deleteDoc(doc(db, 'collecting', userId));
}

// ============ Silver/Golden Pool ============

export async function getSilverPool(userId: string): Promise<any[]> {
  const snap = await getDoc(doc(db, 'silverPool', userId));
  return snap.exists() ? (snap.data().phrases || []) : [];
}

export async function saveSilverPool(userId: string, phrases: any[]): Promise<void> {
  await setDoc(doc(db, 'silverPool', userId), { phrases, updatedAt: Timestamp.now() });
}

export async function getGoldenPool(userId: string): Promise<any[]> {
  const snap = await getDoc(doc(db, 'goldenPool', userId));
  return snap.exists() ? (snap.data().phrases || []) : [];
}

export async function saveGoldenPool(userId: string, phrases: any[]): Promise<void> {
  await setDoc(doc(db, 'goldenPool', userId), { phrases, updatedAt: Timestamp.now() });
}

// ============ Batches ============

export async function getBatches(userId: string) {
  const q = query(collection(db, 'batches'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  const batches = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  batches.sort((a: any, b: any) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
  return batches;
}

export async function createBatch(userId: string, phrases: any[], noteLevel: string = 'bronze'): Promise<string> {
  if (!phrases || phrases.length === 0) {
    throw new Error('No phrases provided');
  }
  const stage = `${noteLevel}_25_18`;
  const docRef = await addDoc(collection(db, 'batches'), {
    userId,
    phrases,
    stage,
    noteLevel,
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

export async function updateBatch(batchId: string, data: any): Promise<void> {
  await updateDoc(doc(db, 'batches', batchId), data);
}

export async function getBatch(batchId: string): Promise<any> {
  const docSnap = await getDoc(doc(db, 'batches', batchId));
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() };
}

export async function deleteBatch(batchId: string): Promise<void> {
  await deleteDoc(doc(db, 'batches', batchId));
}

// ============ Memorized (long-term memory check) ============

export async function saveMemorized(
  userId: string,
  phrases: any[],
  stage: string,
  noteLevel: string
): Promise<void> {
  if (!phrases || phrases.length === 0) return;
  await addDoc(collection(db, 'memorized'), {
    userId,
    phrases,
    stage,
    noteLevel,
    memorizedAt: localDateStr(),
    createdAt: Timestamp.now(),
  });
}

export async function getMemorized(userId: string): Promise<any[]> {
  const q = query(collection(db, 'memorized'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  items.sort((a: any, b: any) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
  return items;
}

export async function getMemorizedForLongTermCheck(userId: string, daysAgo: number = 90): Promise<any[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysAgo);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;

  const q = query(collection(db, 'memorized'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  const eligible: any[] = [];
  snapshot.docs.forEach((d) => {
    const data = d.data();
    if (data.memorizedAt && data.memorizedAt <= cutoffStr) {
      (data.phrases || []).forEach((p: any) => {
        eligible.push({ ...p, memorizedDocId: d.id, noteLevel: data.noteLevel });
      });
    }
  });
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  return eligible.slice(0, 3);
}

// ============ Settings ============

export async function getSettings(userId: string): Promise<any> {
  const docSnap = await getDoc(doc(db, 'settings', userId));
  if (!docSnap.exists()) return { intervals: {} };
  return { ...docSnap.data() };
}

export async function saveSettings(userId: string, settings: any): Promise<void> {
  await setDoc(doc(db, 'settings', userId), settings, { merge: true });
}

// ============ User Preferences (translation notes) ============

export async function getUserPreferences(userId: string): Promise<string> {
  const snap = await getDoc(doc(db, 'preferences', userId));
  return snap.exists() ? (snap.data().notes || '') : '';
}

export async function saveUserPreferences(userId: string, notes: string): Promise<void> {
  await setDoc(doc(db, 'preferences', userId), { notes, updatedAt: Timestamp.now() });
}

export async function getPreferences(userId: string): Promise<any> {
  const snap = await getDoc(doc(db, 'preferences', userId));
  if (!snap.exists()) return null;
  return snap.data();
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
