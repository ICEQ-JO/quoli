import { normalizeWaitlistEmail } from "../shared/waitlist.ts";

/**
 * Hosted waitlist for the public landing page (Vercel Function).
 *
 * Stores `email -> joined timestamp` in one Redis hash through the Upstash REST API, which the
 * Vercel Marketplace Upstash/Redis integration provides as `KV_REST_API_URL` and
 * `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). Without them the
 * form says the waitlist is not open yet; it never pretends to have saved an address.
 * No analytics, no other data, nothing from the local evidence server.
 */
export const KEY = "quoli:waitlist";

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const reply = (status: number, body: Record<string, unknown>, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });

export async function handleWaitlist(
  request: Request,
  env: Env = process.env,
  send: Fetch = fetch,
): Promise<Response> {
  if (request.method !== "POST")
    return reply(405, { error: "Use POST to join the waitlist." }, { Allow: "POST" });
  const host = request.headers.get("host");
  let sameOrigin = false;
  try {
    sameOrigin = !!host && new URL(request.headers.get("origin") ?? "").host === host;
  } catch {}
  if (!sameOrigin || request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return reply(403, { error: "Open the Quoli website directly to join the waitlist." });

  const raw = await request.text();
  if (raw.length > 2048) return reply(413, { error: "Please send just your email address." });
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return reply(400, { error: "Please enter a valid email address." });
  }
  const email = normalizeWaitlistEmail(
    input && typeof input === "object" && "email" in input ? input.email : null,
  );
  if (!email) return reply(400, { error: "Please enter a valid email address." });

  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token)
    return reply(503, { error: "The waitlist isn't open yet. Please try again soon." });
  try {
    // HSETNX keeps the first joined time when someone signs up twice.
    const res = await send(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["HSETNX", KEY, email, new Date().toISOString()]),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(String(res.status));
    return reply(201, { saved: true });
  } catch {
    return reply(503, { error: "We couldn't save your email. Please try again." });
  }
}

export function POST(request: Request): Promise<Response> {
  return handleWaitlist(request);
}

export function GET(request: Request): Promise<Response> {
  return handleWaitlist(request);
}
