import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY, fileName } from "../format.ts";
import type { Lens, LensContext, Selection } from "../state.ts";

interface Item {
  group: string;
  label: string;
  detail: string;
  run: () => void;
}

interface Props extends LensContext {
  close: () => void;
  goto: (lens: Lens, s: Selection) => void;
}

/** ⌘K: one search across files, tool calls, sessions, services and branches. */
export function Palette(p: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const items = useMemo(() => {
    const all: Item[] = [
      ...p.sessions.map((s) => ({
        group: "Sessions",
        label: s.title,
        detail: s.branch ?? "",
        run: () => {
          p.openSession(s.id);
          p.goto("agents", null);
        },
      })),
      ...(p.session?.toolCalls ?? []).map((c) => ({
        group: "Tool calls",
        label: `${c.name}  ${c.summary}`,
        detail: CATEGORY[c.category].label,
        run: () => p.goto("agents", { kind: "tool", id: c.id }),
      })),
      ...(p.code?.files ?? []).map((f) => ({
        group: "Files",
        label: fileName(f.path),
        detail: f.path,
        run: () => p.goto("code", { kind: "file", id: f.path }),
      })),
      ...(p.infra?.services ?? []).map((s) => ({
        group: "Services",
        label: s.name,
        detail: `${s.kind} · ${s.platform}`,
        run: () => p.goto("infra", { kind: "service", id: s.id }),
      })),
      ...(p.git?.branches ?? []).map((b) => ({
        group: "Branches",
        label: b.name,
        detail: b.current ? "checked out" : "",
        run: () => p.goto("git", { kind: "branch", id: b.name }),
      })),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return all.filter((i) => i.group !== "Files" && i.group !== "Tool calls").slice(0, 40);
    const ranked = all
      .map((i) => ({ i, score: score(`${i.label} ${i.detail}`.toLowerCase(), q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.i);
    // Keep each group together, ordered by its best match.
    const groups = [...new Set(ranked.map((i) => i.group))];
    return groups.flatMap((g) => ranked.filter((i) => i.group === g));
  }, [p, query]);

  return (
    <div className="palette-backdrop">
      <button type="button" className="palette-scrim" aria-label="Close search" onClick={p.close} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <input
          ref={input}
          value={query}
          placeholder="Search files, tool calls, sessions, services, branches…"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") p.close();
            if (e.key === "ArrowDown") setActive((a) => Math.min(items.length - 1, a + 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
            if (e.key === "Enter") items[active]?.run();
          }}
        />
        <ul>
          {items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: labels can repeat (two identical commands)
            <li key={i}>
              {(i === 0 || items[i - 1].group !== item.group) && (
                <span className="pg">{item.group}</span>
              )}
              <button
                type="button"
                className={i === active ? "active" : ""}
                onMouseEnter={() => setActive(i)}
                onClick={item.run}
              >
                <span className="pl">{item.label}</span>
                <span className="pd">{item.detail}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="faint pad">Nothing matches “{query}”.</li>}
        </ul>
      </div>
    </div>
  );
}

function score(text: string, q: string): number {
  const at = text.indexOf(q);
  if (at >= 0) return 100 - Math.min(at, 90);
  let i = 0;
  for (const ch of text) if (ch === q[i]) i++;
  return i === q.length ? 5 : 0;
}
