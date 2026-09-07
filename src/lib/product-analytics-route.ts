export function normalizeCampaignRef(value: string | null | undefined): string | null {
  const ref = value?.trim();
  return ref && /^[a-z0-9_-]{1,80}$/i.test(ref) ? ref : null;
}

export function normalizeAnalyticsRoute(route: string, fallbackRef?: string | null): string {
  const url = new URL(route, "https://phrabit.invalid");
  const ref = normalizeCampaignRef(url.searchParams.has("ref") ? url.searchParams.get("ref") : fallbackRef);
  const suffix = ref ? `?ref=${ref}` : "";
  return `${url.pathname.slice(0, 120 - suffix.length)}${suffix}`;
}
