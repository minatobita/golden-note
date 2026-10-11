export interface Phrase {
  japanese: string;
  english: string;
  situation?: string;
}

export const STAGE_CONFIG: Record<string, { from: number; to: number; next: string | null }> = {
  // Bronze
  bronze_25_18: { from: 25, to: 18, next: 'bronze_18_13' },
  bronze_18_13: { from: 18, to: 13, next: 'bronze_13_9' },
  bronze_13_9: { from: 13, to: 9, next: 'bronze_9_6' },
  bronze_9_6: { from: 9, to: 6, next: null },
  // Silver
  silver_25_18: { from: 25, to: 18, next: 'silver_18_13' },
  silver_18_13: { from: 18, to: 13, next: 'silver_13_9' },
  silver_13_9: { from: 13, to: 9, next: 'silver_9_6' },
  silver_9_6: { from: 9, to: 6, next: null },
  // Golden
  golden_25_18: { from: 25, to: 18, next: 'golden_18_13' },
  golden_18_13: { from: 18, to: 13, next: 'golden_13_9' },
  golden_13_9: { from: 13, to: 9, next: 'golden_9_6' },
  golden_9_6: { from: 9, to: 6, next: null },
};

export function getNoteLevel(stage: string): string {
  if (stage.startsWith('golden')) return 'golden';
  if (stage.startsWith('silver')) return 'silver';
  return 'bronze';
}

export function getNoteLevelEmoji(level: string): string {
  if (level === 'golden') return '🥇';
  if (level === 'silver') return '🥈';
  return '🥉';
}

export function getNextPool(noteLevel: string): 'silver' | 'golden' | 'collecting' {
  if (noteLevel === 'bronze') return 'silver';
  if (noteLevel === 'silver') return 'golden';
  return 'collecting';
}
