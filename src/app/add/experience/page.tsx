import TranslationWorkspace from "@/components/TranslationWorkspace";
import { getExperienceGenerationMode } from "@/infrastructure/server/experience-phrase-generator";

export const dynamic = "force-dynamic";

export default function ExperiencePage() {
  const mode = getExperienceGenerationMode(process.env);
  return <TranslationWorkspace inputKind="experience" mockMode={mode === "mock"} experienceEnabled={mode !== "disabled"} />;
}
