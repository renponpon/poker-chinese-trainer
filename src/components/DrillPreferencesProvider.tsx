"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useDataOwner } from "@/lib/translation-draft";
import { useDrillPreferences } from "@/lib/use-drill-preferences";

const DrillPreferencesContext = createContext<ReturnType<typeof useDrillPreferences> | null>(null);

export default function DrillPreferencesProvider({ children }: { children: ReactNode }) {
  const owner = useDataOwner();
  return <OwnedDrillPreferences key={owner} owner={owner}>{children}</OwnedDrillPreferences>;
}

function OwnedDrillPreferences({ owner, children }: { owner: string; children: ReactNode }) {
  const preferences = useDrillPreferences(owner);
  return <DrillPreferencesContext.Provider value={preferences}>{children}</DrillPreferencesContext.Provider>;
}

export function useSharedDrillPreferences() {
  const preferences = useContext(DrillPreferencesContext);
  if (!preferences) throw new Error("drill_preferences_provider_missing");
  return preferences;
}
