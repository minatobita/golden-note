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

function localDateStr(d: Date = new Date()): string {
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

// ============ Long-term Memory Pool ============
// 構造: longTermPool/{userId} = {
//   phrases: [{ id, japanese, english, situation, memorizedAt, addedAt, checkCount, lastCheckedAt, sourceStage, noteLevel }],
//   migrated: true, updatedAt
// }
// - 配列は常に「覚えた日(memorizedAt)が古い順」に並んだキュー
// - 新しく覚えたフレーズ・正解して日付更新したフレーズは末尾へ
// - 旧 memorized コレクションのデータは初回アクセス時に自動でこのプールへ移行（旧データは削除しない）

function newLtId(): string {
  return `lt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sortPool(phrases: any[]): any[] {
  // 安定ソート: 同じ日付なら元の順序（＝追加順）を保つ
  return phrases
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const am = a.p.memorizedAt || '';
      const bm = b.p.memorizedAt || '';
      if (am !== bm) return am < bm ? -1 : 1;
      return a.i - b.i;
    })
    .map(({ p }) => p);
}

async function writeLongTermPool(userId: string, phrases: any[]): Promise<void> {
  await setDoc(doc(db, 'longTermPool', userId), {
    phrases: sortPool(phrases),
    migrated: true,
    updatedAt: Timestamp.now(),
  });
}

/** 長期記憶プールを取得（古い順）。旧 memorized データがあれば初回のみ移行する。 */
export async function getLongTermPool(userId: string): Promise<any[]> {
  const ref = doc(db, 'longTermPool', userId);
  const snap = await getDoc(ref);
  const existing: any[] = snap.exists() ? (snap.data().phrases || []) : [];
  if (snap.exists() && snap.data().migrated) return sortPool(existing);

  // 旧 memorized コレクションから移行
  const q = query(collection(db, 'memorized'), where('userId', '==', userId));
  const oldSnap = await getDocs(q);
  const oldDocs = oldSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .sort((a: any, b: any) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  const migrated: any[] = [];
  oldDocs.forEach((m: any) => {
    (m.phrases || []).forEach((p: any) => {
      if (!p.japanese && !p.english) return;
      const memAt = p.memorizedAt || m.memorizedAt || localDateStr();
      migrated.push({
        id: newLtId(),
        japanese: p.japanese || '',
        english: p.english || '',
        situation: p.situation || '',
        memorizedAt: memAt,
        addedAt: m.memorizedAt || memAt,
        checkCount: p.checkCount || 0,
        lastCheckedAt: p.lastCheckedAt || null,
        sourceStage: m.stage || '',
        noteLevel: m.noteLevel || 'bronze',
      });
    });
  });

  const merged = [...migrated, ...existing];
  await writeLongTermPool(userId, merged);
  return sortPool(merged);
}

/** 覚えたフレーズを長期記憶プールの末尾に追加（覚えた日=今日） */
export async function addToLongTermPool(
  userId: string,
  phrases: any[],
  stage: string,
  noteLevel: string
): Promise<void> {
  if (!phrases || phrases.length === 0) return;
  const today = localDateStr();
  const pool = await getLongTermPool(userId);
  const added = phrases
    .filter((p: any) => p && (p.japanese || p.english))
    .map((p: any) => ({
      id: newLtId(),
      japanese: p.japanese || '',
      english: p.english || '',
      situation: p.situation || '',
      memorizedAt: today,
      addedAt: today,
      checkCount: 0,
      lastCheckedAt: null,
      sourceStage: stage,
      noteLevel,
    }));
  await writeLongTermPool(userId, [...pool, ...added]);
}

// 旧名の互換用（quizなど古いコードから呼ばれても動くように）
export async function saveMemorized(userId: string, phrases: any[], stage: string, noteLevel: string): Promise<void> {
  await addToLongTermPool(userId, phrases, stage, noteLevel);
}

/** 旧 memorized コレクションの生データ（互換用。新しい画面では getLongTermPool を使う） */
export async function getMemorized(userId: string): Promise<any[]> {
  const q = query(collection(db, 'memorized'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * 長期記憶チェックの出題を取得する。
 * - 日数の条件はなし。長期記憶フォルダーの先頭（覚えた日が最も古いもの）から count 個を順番に出す
 * - 正解したものは覚えた日が今日になり末尾へ回るので、フォルダー全体を一周するまで同じものは出ない
 */
export async function getLongTermQuestions(
  userId: string,
  count: number = 3
): Promise<{ questions: any[]; poolSize: number }> {
  const pool = await getLongTermPool(userId);
  const usable = pool.filter((p) => p.japanese && p.english);
  return { questions: usable.slice(0, count), poolSize: pool.length };
}

// 旧名の互換用（他のファイルから呼ばれてもビルドが通るように）
export async function getMemorizedForLongTermCheck(userId: string, _daysAgo?: number, count: number = 3): Promise<any[]> {
  return (await getLongTermQuestions(userId, count)).questions;
}

/**
 * 長期記憶チェックの結果を反映する。
 * - 正解: プールに残し、覚えた日を今日に更新 → キューの末尾へ
 * - 不正解: プールから削除し、収集リスト（現在のブロンズのプール）へ移動
 * 戻り値: 収集リストへ移動した件数
 */
export async function applyLongTermResults(
  userId: string,
  results: { id: string; correct: boolean }[]
): Promise<number> {
  if (!results || results.length === 0) return 0;
  const today = localDateStr();
  const pool = await getLongTermPool(userId);
  const resultMap = new Map(results.map((r) => [r.id, r.correct]));

  const kept: any[] = [];
  const refreshed: any[] = [];
  const failed: any[] = [];

  pool.forEach((p) => {
    if (!resultMap.has(p.id)) { kept.push(p); return; }
    if (resultMap.get(p.id)) {
      refreshed.push({ ...p, memorizedAt: today, lastCheckedAt: today, checkCount: (p.checkCount || 0) + 1 });
    } else {
      failed.push({
        japanese: p.japanese || '',
        english: p.english || '',
        situation: p.situation || '',
        source: 'long-term-failed',
      });
    }
  });

  // 正解したものは末尾へ（今日の日付なので、ソート後も最後尾）
  await writeLongTermPool(userId, [...kept, ...refreshed]);

  if (failed.length > 0) {
    const existing = await getCollecting(userId);
    await saveCollecting(userId, [...(existing || []), ...failed]);
  }
  return failed.length;
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

// Alias for workshop compatibility
export async function getPreferences(userId: string): Promise<any> {
  const snap = await getDoc(doc(db, 'preferences', userId));
  if (!snap.exists()) return null;
  return snap.data();
}
