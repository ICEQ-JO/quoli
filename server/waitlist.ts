import { chmodSync, mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { home } from "./db.ts";

export function normalizeWaitlistEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,63}$/.test(email)) return null;
  const [local, domain] = email.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes(".."))
    return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  return domain
    .split(".")
    .every((part) => part.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))
    ? email
    : null;
}

/** Separate from captured sessions; joining never reads the evidence database. */
export function saveWaitlistEmail(email: string, file = join(home(), "waitlist.sqlite")): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  try {
    chmodSync(file, 0o600);
    db.exec(
      "CREATE TABLE IF NOT EXISTS waitlist (email TEXT PRIMARY KEY, joined_at TEXT NOT NULL)",
    );
    db.prepare("INSERT OR IGNORE INTO waitlist (email, joined_at) VALUES (?, ?)").run(
      email,
      new Date().toISOString(),
    );
  } finally {
    db.close();
  }
}

export async function waitlistRequest(
  req: IncomingMessage,
  res: ServerResponse,
  save = saveWaitlistEmail,
): Promise<void> {
  const reply = (status: number, error?: string) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(error ? { error } : { saved: true }));
  };
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(405, "Use POST to join the waitlist.");
  }
  if (
    req.headers.origin !== `http://${req.headers.host}` ||
    req.headers["content-type"]?.split(";")[0] !== "application/json"
  )
    return reply(403, "Open Quoli directly to join the waitlist.");
  let size = 0;
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2048) return reply(413, "Please send just your email address.");
      chunks.push(chunk);
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return reply(400, "Please enter a valid email address.");
    }
    const email = normalizeWaitlistEmail(
      input && typeof input === "object" && "email" in input ? input.email : null,
    );
    if (!email) return reply(400, "Please enter a valid email address.");
    save(email);
    return reply(201);
  } catch {
    return reply(503, "We couldn't save your email. Please try again.");
  }
}
