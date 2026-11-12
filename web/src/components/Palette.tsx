import { useMemo, useState } from "react";
import { CATEGORY, fileName } from "../format.ts";
import { navigate, paths } from "../router.ts";
import type { Lens, LensContext, Selection } from "../state.ts";
import { useDialog } from "./Dialog.tsx";

export interface PaletteItem {
  group: string;
  label: string;
  detail: string;
  run: () => void;
  /** Only shown once the user types (large groups like files and tool calls). */
  quiet?: boolean;
}

export const pageItems = (): PaletteItem[] =>
  [
    ["Home", paths.home()],
    ["Projects", paths.projects()],
    ["Sessions", paths.sessions()],
    ["Usage", paths.usage()],
    ["Insights", paths.insights()],
    ["Settings", paths.settings()],
  ].map(([label, to]) => ({ group: "Go to", label, detail: to, run: () => navigate(to) }));

interface BoardProps extends LensContext {
  close: () => void;
  goto: (lens: Lens, s: Selection) => void;
}

/** ⌘K on the board: files, tool calls, sessions, services and branches of this project. */
export function Palette(p: BoardProps) {
  const items: PaletteItem[] = useMemo(
    () => [
      ...p.sessions.map((s) => ({
        group: "Sessions",
        label: s.title,
        detail: s.branch ?? "",
        run: () => p.openSession(s.id),
      })),
      ...(p.session?.toolCalls ?? []).map((c) => ({
        group: "Tool calls",
        label: `${c.name}  ${c.summary}`,
        detail: CATEGORY[c.category].label,
        quiet: true,
        run: () => p.goto("agents", { kind: "tool", id: c.id }),
      })),
      ...(p.code?.files ?? []).map((f) => ({
        group: "Files",
        label: fileName(f.path),
        detail: f.path,
        quiet: true,
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
      ...pageItems(),
    ],
    [p.sessions, p.session, p.code, p.infra, p.git, p.openSession, p.goto],
  );
  return (
    <PaletteView
      items={items}
      close={p.close}
      placeholder="Search files, tool calls, sessions, services, branches…"
    />
  );
}

export function PaletteView({
  items: all,
  close,
  placeholder,
}: {
  items: PaletteItem[];
  close: () => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const dialog = useDialog(close);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all.filter((i) => !i.quiet).slice(0, 40);
    const ranked = all
      .map((i) => ({ i, score: score(`${i.label} ${i.detail}`.toLowerCase(), q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.i);
    // Keep each group together, ordered by its best match.
    const groups = [...new Set(ranked.map((i) => i.group))];
    return groups.flatMap((g) => ranked.filter((i) => i.group === g));
  }, [all, query]);

  return (
    <div className="palette-backdrop">
      <button
        type="button"
        className="palette-scrim"
        tabIndex={-1}
        aria-label="Close search"
        onClick={close}
      />
      <div
        ref={dialog.ref}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onKeyDown={dialog.onKeyDown}
      >
        <input
          aria-label="Search"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(items.length - 1, a + 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
            if (e.key === "Enter" && items[active]) {
              items[active].run();
              close();
            }
          }}
        />
        <p className="sr-only" role="status">
          {items.length ? `${items.length} results` : "No results"}
        </p>
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
                tabIndex={-1}
                aria-current={i === active ? "true" : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  item.run();
                  close();
                }}
              >
                <span className="pl" title={item.label}>
                  {item.label}
                </span>
                <span className="pd" title={item.detail}>
                  {item.detail}
                </span>
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
