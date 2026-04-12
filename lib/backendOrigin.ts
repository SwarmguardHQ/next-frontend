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
