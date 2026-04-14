/**
 * SSE and other direct browser → FastAPI connections cannot use the Next.js
 * `/api` rewrite. Use an absolute backend origin when needed.
 */
export function getBackendOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_BACKEND_ORIGIN?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (apiUrl?.startsWith("http://") || apiUrl?.startsWith("https://")) {
    try {
      return new URL(apiUrl).origin;
    } catch {
      /* fall through */
    }
  }
  return "http://127.0.0.1:8000";
}

/** Direct FastAPI URL for world SSE (bypass Next ``/api`` rewrite). */
export function getWorldStreamUrl(intervalMs = 500): string {
  const u = new URL("/world/stream", `${getBackendOrigin()}/`);
  u.searchParams.set("interval_ms", String(intervalMs));
  return u.toString();
}
