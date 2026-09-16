export interface Phrase {
  userId: string;
  japanese: string;
  english: string;
  situation?: string;
  status: 'untranslated' | 'translated';
  createdAt: any;
}

export interface Batch {
  userId: string;
  phrases: { japanese: string; english: string; situation?: string }[];
  stage: string;
  noteLevel: 'bronze' | 'silver' | 'gold';
  totalPhrases: number;
  targetCount: number;
  status: 'translating' | 'studying' | 'reviewing' | 'completed';
  reviewHistory: any[];
  createdAt: any;
  nextReviewDate: string | null;
  lastReviewDate: string | null;
  intervalDays: number;
}

export interface UserSettings {
  intervals: { [key: string]: number };
  longTermCheckDays: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  intervals: {
    bronze_25_18: 1,
    bronze_18_13: 4,
    bronze_13_9: 14,
    bronze_9_6: 28,
    silver_25_18: 1,
    silver_18_13: 4,
    silver_13_9: 14,
    silver_9_6: 28,
    gold_25_18: 1,
    gold_18_13: 4,
    gold_13_9: 14,
    gold_9_6: 28,
  },
  longTermCheckDays: 90,
};

export const STAGE_CONFIG: { [key: string]: { from: number; to: number; next: string | null } } = {
  bronze_25_18: { from: 25, to: 18, next: 'bronze_18_13' },
  bronze_18_13: { from: 18, to: 13, next: 'bronze_13_9' },
  bronze_13_9: { from: 13, to: 9, next: 'bronze_9_6' },
  bronze_9_6: { from: 9, to: 6, next: null },
  silver_25_18: { from: 25, to: 18, next: 'silver_18_13' },
  silver_18_13: { from: 18, to: 13, next: 'silver_13_9' },
  silver_13_9: { from: 13, to: 9, next: 'silver_9_6' },
  silver_9_6: { from: 9, to: 6, next: null },
  gold_25_18: { from: 25, to: 18, next: 'gold_18_13' },
  gold_18_13: { from: 18, to: 13, next: 'gold_13_9' },
  gold_13_9: { from: 13, to: 9, next: 'gold_9_6' },
  gold_9_6: { from: 9, to: 6, next: null },
};
