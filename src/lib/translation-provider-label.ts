export function getTranslationProviderLabel(provider?: string | null): string | null {
  switch (provider) {
    case "deepl":
      return "DeepL翻訳";
    case "azure":
      return "Azure瞬間翻訳";
    case "gemini":
      return "Gemini品質";
    default:
      return null;
  }
}
