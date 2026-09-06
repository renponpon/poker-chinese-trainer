const PRODUCTION_SUPABASE_REF = "whuatcawoezfrvzplmri";

export function assertPreviewEnvironment(environment: Record<string, string | undefined>): void {
  if (environment.VERCEL_ENV !== "preview") return;
  const issues: string[] = [];
  const reference = environment.PHRABIT_PREVIEW_SUPABASE_REF?.trim() ?? "";
  if (!/^[a-z]{20}$/.test(reference) || reference === PRODUCTION_SUPABASE_REF) {
    issues.push("PHRABIT_PREVIEW_SUPABASE_REF must identify a separate test project");
  }
  if (environment.NEXT_PUBLIC_SUPABASE_URL !== `https://${reference}.supabase.co`) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL must match the isolated test project");
  }
  for (const name of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "GEMINI_API_KEY", "DEEPL_API_KEY", "AZURE_TRANSLATOR_KEY"]) {
    if (!environment[name]?.trim()) issues.push(`${name} is required for preview verification`);
  }
  for (const name of ["NOTION_API_KEY", "NOTION_DATABASE_ID", "RESEND_API_KEY"]) {
    if (environment[name]?.trim()) issues.push(`${name} must be disabled in preview to prevent external writes`);
  }
  if (issues.length) throw new Error(`Unsafe or incomplete Phrabit Preview configuration:\n${issues.join("\n")}`);
}
