import {
  createCurrentLexicon,
  isCurrentLexicon,
  upgradeCurrentLexicon,
  type CurrentLexicon,
} from "@/lib/keyword-matcher";

export const CURRENT_LEXICON_STORAGE_KEY = "resume-match-current-lexicon-v1";

/** Return the one complete, latest lexicon used by every scanner and lookup. */
export function loadCurrentLexicon(storage: Pick<Storage, "getItem" | "setItem">): CurrentLexicon {
  const serialized = storage.getItem(CURRENT_LEXICON_STORAGE_KEY);
  if (serialized) {
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (isCurrentLexicon(parsed)) {
        const upgraded = upgradeCurrentLexicon(parsed);
        if (upgraded !== parsed) storage.setItem(CURRENT_LEXICON_STORAGE_KEY, JSON.stringify(upgraded));
        return upgraded;
      }
    } catch {
      // Fall through to a clean seed if local data is malformed.
    }
  }
  const seeded = createCurrentLexicon();
  storage.setItem(CURRENT_LEXICON_STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

export function saveCurrentLexicon(storage: Pick<Storage, "setItem">, lexicon: CurrentLexicon) {
  storage.setItem(CURRENT_LEXICON_STORAGE_KEY, JSON.stringify(lexicon));
}
