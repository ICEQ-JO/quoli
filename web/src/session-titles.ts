import { useSyncExternalStore } from "react";

type Title = { id: string; title: string };
const key = (id: string) => `quoli.sessionTitle.${id}`;
const CHANGE = "quoli:session-title";
let revision = 0;
const subscribe = (changed: () => void) => {
  const onChange = () => {
    revision++;
    changed();
  };
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
};
export function useTitleVersion() {
  return useSyncExternalStore(subscribe, () => revision);
}

export function displayTitle(session: Title, storage?: Pick<Storage, "getItem">): string {
  try {
    return (storage ?? localStorage).getItem(key(session.id)) || session.title;
  } catch {
    return session.title;
  }
}

/** Browser-only presentation metadata. Never writes captured evidence or sync payloads. */
export function saveTitle(
  sessionId: string,
  title: string,
  storage: Pick<Storage, "setItem" | "removeItem">,
) {
  const value = title.trim();
  if (value.length > 120) throw new Error("Use 120 characters or fewer.");
  if (value) storage.setItem(key(sessionId), value);
  else storage.removeItem(key(sessionId));
}
export function setDisplayTitle(sessionId: string, title: string) {
  saveTitle(sessionId, title, localStorage);
  window.dispatchEvent(new Event(CHANGE));
}
