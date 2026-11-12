import { useEffect, useRef, useState } from "react";
import type { SessionDetail, ToolCall } from "../../../shared/model.ts";
import { announceCalls } from "../a11y.ts";

const EVERY_MS = 4000;

/**
 * A polite live region that says what a running session just did. Calls that arrive close
 * together are batched into one message so a busy agent does not flood a screen reader.
 */
export function LiveAnnouncer({ session }: { session: SessionDetail }) {
  const [message, setMessage] = useState("");
  const seen = useRef<{ id: string; ids: Set<string> } | null>(null);
  const pending = useRef<ToolCall[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (seen.current?.id !== session.id) {
      // First look at a session: everything already there is history, not news.
      clearTimeout(timer.current);
      timer.current = undefined;
      pending.current = [];
      seen.current = { id: session.id, ids: new Set(session.toolCalls.map((c) => c.id)) };
      setMessage("");
      return;
    }
    const known = seen.current.ids;
    const fresh = session.toolCalls.filter((c) => !known.has(c.id));
    for (const c of fresh) known.add(c.id);
    if (!session.live || !fresh.length) return;
    pending.current.push(...fresh);
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setMessage(announceCalls(pending.current));
      pending.current = [];
    }, EVERY_MS);
  }, [session]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
