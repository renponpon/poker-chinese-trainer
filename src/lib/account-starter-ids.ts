import type { SavedPhraseSnapshot } from "@/application/phrase/load-saved-phrases";
import { STARTER_PHRASES } from "./starter-phrases";

const starterIds = new Set(STARTER_PHRASES.map((phrase) => phrase.id));

export async function createAccountStarterIdMap(
  userId: string,
  local: SavedPhraseSnapshot,
  baseline: SavedPhraseSnapshot | null | undefined,
  cloud: SavedPhraseSnapshot,
): Promise<Map<string, string>> {
  const knownIds = new Set([...cloud.phrases, ...(baseline?.phrases ?? [])].map((phrase) => phrase.id));
  const candidates = [...new Set(local.phrases.map((phrase) => phrase.id))]
    .filter((id) => starterIds.has(id) && !knownIds.has(id));
  const mappings = await Promise.all(candidates.map(async (id) => {
    const namespace = Uint8Array.from(id.replaceAll("-", "").match(/../g)!, (pair) => parseInt(pair, 16));
    const name = new TextEncoder().encode(userId);
    const input = new Uint8Array(namespace.length + name.length);
    input.set(namespace);
    input.set(name, namespace.length);
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", input)).slice(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return [id, `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`] as const;
  }));
  return new Map(mappings);
}
