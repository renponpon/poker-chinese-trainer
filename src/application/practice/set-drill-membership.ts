import type { Phrase, SrsItem } from "../../lib/types";
import { syncDrillSchedule } from "./drill-schedule";

export type DrillMembershipStorage = {
  updatePhrase: (phraseId: string, updates: Pick<Phrase, "shouldDrill">) => Phrase[];
  loadSrsItems: () => SrsItem[];
  saveSrsItems: (items: SrsItem[]) => void;
};

export type SetDrillMembershipInput = {
  phrase: Pick<Phrase, "id" | "shouldDrill">;
  enabled: boolean;
  storage: DrillMembershipStorage;
  now?: number;
};

export type SetDrillMembershipResult = {
  phrases: Phrase[];
  srsItems: SrsItem[];
};

export function setPhraseDrillMembership(
  input: SetDrillMembershipInput,
): SetDrillMembershipResult {
  const phrases = input.storage.updatePhrase(input.phrase.id, {
    shouldDrill: input.enabled,
  });
  const synced = syncDrillSchedule({
    phrases,
    items: input.storage.loadSrsItems(),
    storage: { saveSrsItems: input.storage.saveSrsItems },
    now: input.now,
  });

  return { phrases, srsItems: synced.items };
}

export function addPhraseToDrill(
  input: Omit<SetDrillMembershipInput, "enabled">,
): SetDrillMembershipResult {
  return setPhraseDrillMembership({ ...input, enabled: true });
}

export function removePhraseFromDrill(
  input: Omit<SetDrillMembershipInput, "enabled">,
): SetDrillMembershipResult {
  return setPhraseDrillMembership({ ...input, enabled: false });
}
