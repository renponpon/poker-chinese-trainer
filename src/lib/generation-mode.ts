export type GenerationMode = "speed" | "normal" | "quality";

export const GENERATION_MODE_ORDER: GenerationMode[] = ["speed", "normal", "quality"];

export function parseGenerationMode(value: unknown): GenerationMode {
  if (value === "speed" || value === "normal" || value === "quality") {
    return value;
  }
  if (value === "fast") return "normal";
  if (value === "full") return "quality";
  return "normal";
}

export function getGenerationModeLabel(mode: GenerationMode): string {
  switch (mode) {
    case "speed":
      return "速度";
    case "normal":
      return "通常";
    case "quality":
      return "品質";
  }
}

export function cycleGenerationMode(mode: GenerationMode): GenerationMode {
  const index = GENERATION_MODE_ORDER.indexOf(mode);
  return GENERATION_MODE_ORDER[(index + 1) % GENERATION_MODE_ORDER.length];
}

export function getGenerationModeTitle(mode: GenerationMode, readingLabel = "ピンイン"): string {
  const followUp = readingLabel
    ? `${readingLabel}・解説は後から`
    : "解説は後から";
  switch (mode) {
    case "speed":
      return `Azureで最速翻訳（${followUp}）`;
    case "normal":
      return `DeepLで翻訳（${followUp}）`;
    case "quality":
      return "Geminiで場面に合わせた翻訳と解説";
  }
}
