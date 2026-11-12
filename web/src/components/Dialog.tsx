import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";
import { shortcutGroups } from "../a11y.ts";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Makes an element behave as a modal dialog: focus moves in when it opens, Tab stays inside,
 * Escape closes, and focus goes back to whatever had it before. Spread `onKeyDown` on the dialog.
 */
export function useDialog(close: () => void, initial?: RefObject<HTMLElement | null>) {
  const root = useRef<HTMLDivElement>(null);
  const closer = useRef(close);
  closer.current = close;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = initial?.current ?? root.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root.current)?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, [initial]);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closer.current();
      return;
    }
    if (e.key !== "Tab" || !root.current) return;
    const items = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    e.preventDefault();
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    const next = e.shiftKey ? (at <= 0 ? last : at - 1) : at === last ? 0 : at + 1;
    items[next].focus();
  };
  return { ref: root, onKeyDown };
}

/** The `?` overlay: every keyboard shortcut, grouped. */
export function ShortcutOverlay({ close }: { close: () => void }) {
  const dialog = useDialog(close);
  return (
    <div className="modal-backdrop">
      <button
        type="button"
        className="palette-scrim"
        tabIndex={-1}
        aria-label="Close keyboard shortcuts"
        onClick={close}
      />
      <div
        ref={dialog.ref}
        onKeyDown={dialog.onKeyDown}
        className="modal shortcuts"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kbd-title"
        tabIndex={-1}
      >
        <h2 id="kbd-title">Keyboard shortcuts</h2>
        {shortcutGroups().map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3>{g.title}</h3>
            <dl className="kbd-list">
              {g.items.map((s) => (
                <div key={s.does}>
                  <dt>
                    {s.keys.map((k, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: keys can repeat (arrows)
                      <kbd key={i}>{k}</kbd>
                    ))}
                  </dt>
                  <dd>{s.does}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
