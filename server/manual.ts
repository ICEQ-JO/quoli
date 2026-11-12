import { randomUUID } from "node:crypto";
import type { InfraMap, ManualService, Service, ServiceKind } from "../shared/model.ts";
import { PROVIDERS } from "../shared/providers.ts";
import type { Store } from "./db.ts";

/** Kinds a user may pick; pipelines come only from workflow files. */
export const MANUAL_KINDS: ServiceKind[] = [
  "web",
  "api",
  "worker",
  "function",
  "container",
  "database",
  "cache",
  "queue",
  "external",
];
const MAX_SERVICES = 100;
const MAX_TEXT = 80;
const MAX_URL = 500;

const key = (projectId: string) => `services:${projectId}`;

export function loadManual(store: Store, projectId: string): ManualService[] {
  const raw = store.getSetting(key(projectId));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveManual(store: Store, projectId: string, list: ManualService[]) {
  if (list.length) store.putSetting(key(projectId), JSON.stringify(list));
  else store.deleteSetting(key(projectId));
}

const text = (v: unknown, field: string, max = MAX_TEXT): string => {
  if (typeof v !== "string" || !v.trim()) throw new Error(`${field} is required`);
  const t = v.trim();
  if (t.length > max) throw new Error(`${field} must be at most ${max} characters`);
  return t;
};

/**
 * Checks a hand-made entry and returns a clean copy. Throws with a readable message. The URL
 * must be http(s): it is shown as a link and never fetched.
 */
export function validateManual(input: Record<string, unknown>, id?: string): ManualService {
  const kind = input.kind as ServiceKind;
  if (!MANUAL_KINDS.includes(kind))
    throw new Error(`kind must be one of ${MANUAL_KINDS.join(", ")}`);
  let url: string | null = null;
  if (input.url !== undefined && input.url !== null && input.url !== "") {
    const raw = text(input.url, "url", MAX_URL);
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("url must be a full http(s) address");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      throw new Error("url must start with http:// or https://");
    if (parsed.username || parsed.password) throw new Error("url must not contain credentials");
    url = parsed.toString();
  }
  let sourceDir: string | null = null;
  if (input.sourceDir !== undefined && input.sourceDir !== null && input.sourceDir !== "") {
    sourceDir = text(input.sourceDir, "sourceDir", 300).replace(/^\.?\/+|\/+$/g, "");
    if (sourceDir.split("/").includes(".."))
      throw new Error("sourceDir must stay inside the repository");
  }
  const of = typeof input.of === "string" && input.of ? input.of.slice(0, 300) : null;
  return {
    id: id ?? `m-${randomUUID().slice(0, 8)}`,
    of,
    name: text(input.name, "name"),
    kind,
    provider: text(input.provider, "provider", 40),
    url,
    sourceDir,
  };
}

export function addManual(list: ManualService[], entry: ManualService): ManualService[] {
  if (list.length >= MAX_SERVICES) throw new Error(`At most ${MAX_SERVICES} services per project`);
  if (entry.of && list.some((m) => m.of === entry.of))
    throw new Error("That service already has an entry; edit it instead");
  return [...list, entry];
}

/** The platform string a provider id becomes on the board; free text stays as typed. */
const platformOf = (provider: string) =>
  PROVIDERS.find((p) => p.id === provider.toLowerCase())?.id ?? provider;

/**
 * Detected services plus the user's entries. An entry with `of` renames and links the detected
 * service it points at; its file stays the evidence. An entry whose service is gone, or one added
 * from scratch, becomes its own card. Hand-made cards never carry metrics.
 */
export function mergeManual(map: InfraMap, list: ManualService[]): InfraMap {
  const services: Service[] = map.services.map((s) => ({ ...s }));
  for (const m of list) {
    const target = m.of ? services.find((s) => s.id === m.of) : undefined;
    if (target) {
      target.name = m.name;
      target.url = m.url;
      target.manual = m.id;
      continue;
    }
    services.push({
      id: `manual:${m.id}`,
      name: m.name,
      kind: m.kind,
      platform: platformOf(m.provider),
      sourceDir: m.sourceDir,
      ports: [],
      basis: "derived",
      evidence: "added by you",
      metrics: null,
      url: m.url,
      manual: m.id,
    });
  }
  return { services, links: map.links };
}
