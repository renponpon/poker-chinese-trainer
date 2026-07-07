import type { Phrase, SrsItem } from "../../lib/types";

export type SavedPhraseSnapshot = {
  phrases: Phrase[];
  srsItems: SrsItem[];
};

export type LoadSavedPhrasesStorage = {
  loadByAccessToken: (accessToken: string) => Promise<SavedPhraseSnapshot | null>;
  loadByOwnerKey: (ownerKey: string) => Promise<SavedPhraseSnapshot>;
};

export function normalizeLoadSavedPhrasesRequest(input: {
  ownerKey: unknown;
}): {
  ownerKey: string;
} {
  return {
    ownerKey: typeof input.ownerKey === "string" ? input.ownerKey.trim() : "",
  };
}

export async function loadSavedPhrases(input: {
  accessToken: string;
  ownerKey: string;
  storage: LoadSavedPhrasesStorage;
}): Promise<SavedPhraseSnapshot> {
  if (input.accessToken) {
    const authenticated = await input.storage.loadByAccessToken(input.accessToken);
    if (authenticated) return authenticated;
  }

  if (!input.ownerKey) {
    return { phrases: [], srsItems: [] };
  }

  return input.storage.loadByOwnerKey(input.ownerKey);
}
