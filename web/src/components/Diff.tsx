import type { ToolCall } from "../../../shared/model.ts";

/** Renders a unified git diff, coloring lines by their prefix. */
export function UnifiedDiff({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l));
  return (
    <pre className="diff">
      {lines.map((l, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static diff lines
          key={i}
          className={
            l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : l.startsWith("@@") ? "hunk" : ""
          }
        >
          {l || " "}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

/** The change an Edit / MultiEdit / Write call asked for, exactly as recorded. */
export function RecordedChange({ call }: { call: ToolCall }) {
  const input = (call.input ?? {}) as Record<string, unknown>;
  const pairs: [string, string][] = [];
  if (typeof input.old_string === "string" && typeof input.new_string === "string") {
    pairs.push([input.old_string, input.new_string]);
  }
  if (Array.isArray(input.edits)) {
    for (const e of input.edits as Record<string, unknown>[]) {
      if (typeof e.old_string === "string" && typeof e.new_string === "string")
        pairs.push([e.old_string, e.new_string]);
    }
  }
  if (typeof input.content === "string") pairs.push(["", input.content]);
  if (!pairs.length) return <p className="faint">This call recorded no text change.</p>;
  return (
    <pre className="diff">
      {pairs.map(([before, after], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static edit list
        <span key={i}>
          {i > 0 && <span className="hunk">{"⋯\n"}</span>}
          {(before ? before.split("\n") : []).map((l, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static lines
            <span key={`d${j}`} className="del">{`- ${l}\n`}</span>
          ))}
          {after.split("\n").map((l, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static lines
            <span key={`a${j}`} className="add">{`+ ${l}\n`}</span>
          ))}
        </span>
      ))}
    </pre>
  );
}
