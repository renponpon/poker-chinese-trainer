export function getBearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
}
