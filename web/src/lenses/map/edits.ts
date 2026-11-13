import type { CodeSymbol, ToolCall } from "../../../../shared/model.ts";

export interface FileEdit {
  file: string;
  /** New text of each replacement; blank pieces (pure deletions) are dropped. */
  added: string[];
  /** True for a Write: the whole file was replaced, so no symbol can be singled out. */
  whole: boolean;
}

/** The text an Edit, MultiEdit or Write call put into its file, as recorded. */
export function editOf(call: ToolCall): FileEdit | null {
  const file = call.files[0];
  if (call.category !== "edit" || !file) return null;
  const input = (call.input ?? {}) as Record<string, unknown>;
  const added: string[] = [];
  if (typeof input.new_string === "string") added.push(input.new_string);
  if (Array.isArray(input.edits)) {
    for (const e of input.edits as Record<string, unknown>[])
      if (typeof e.new_string === "string") added.push(e.new_string);
  }
  return { file, added: added.filter((a) => a.trim()), whole: typeof input.content === "string" };
}

/**
 * Symbols whose lines contain text an edit added. Derived by finding the new text in the file as it
 * is now, so a later edit that moved or removed it hides it. The innermost symbol wins: a method
 * is marked, not its class.
 */
export function editedSymbols(text: string, symbols: CodeSymbol[], added: string[]): Set<string> {
  const hit = new Set<string>();
  for (const piece of added) {
    const at = text.indexOf(piece);
    if (at < 0) continue;
    const first = text.slice(0, at).split("\n").length;
    const last = first + piece.replace(/\n+$/, "").split("\n").length - 1;
    const inside = symbols.filter(
      (s) => s.kind !== "module" && s.startLine <= last && s.endLine >= first,
    );
    for (const s of inside) {
      const wraps = inside.some(
        (o) =>
          o !== s &&
          o.startLine >= s.startLine &&
          o.endLine <= s.endLine &&
          (o.startLine > s.startLine || o.endLine < s.endLine),
      );
      if (!wraps) hit.add(s.id);
    }
  }
  return hit;
}
