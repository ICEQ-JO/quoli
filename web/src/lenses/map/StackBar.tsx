import type { CodeGraph } from "../../../../shared/model.ts";
import { compact, plural } from "../../format.ts";

/** What the code is made of: frameworks and languages with their evidence, and what the map was built from. */
export function StackBar({ graph, building }: { graph: CodeGraph | null; building: boolean }) {
  if (!graph) {
    return (
      <div className="stack-bar" role="status">
        <span className="faint">
          {building
            ? "Reading the code… the first build of a large repository takes a few seconds."
            : "Code map"}
        </span>
      </div>
    );
  }
  const { stack } = graph;
  const languages = stack.languages.filter((l) => l.share >= 0.02);
  return (
    <div className="stack-bar">
      <ul className="stack-list" aria-label="Detected stack">
        {stack.frameworks.map((f) => (
          <li key={`${f.name}:${f.evidence}`}>
            <span
              className="chip"
              title={`${f.name}${f.version ? ` ${f.version}` : ""} · found in ${f.evidence}`}
            >
              {f.name}
            </span>
          </li>
        ))}
        {languages.map((l) => (
          <li key={l.name}>
            <span className="chip lang" title={`${plural(l.files, "file")} of ${l.name}`}>
              {l.name} <em>{Math.round(l.share * 100)}%</em>
            </span>
          </li>
        ))}
        {stack.frameworks.length + languages.length === 0 && (
          <li className="faint">No frameworks or languages detected</li>
        )}
      </ul>
      <p className="stack-meta">
        {stack.packages.length > 0 && <span>{plural(stack.packages.length, "package")}</span>}
        <span title={`Generated ${graph.generatedAt}`}>
          Built from {graph.commit ? <code>{graph.commit.slice(0, 7)}</code> : "the working tree"} ·{" "}
          {compact(graph.stats.files)} files
        </span>
        {graph.truncated && <span className="warn">partial: file limit reached</span>}
      </p>
    </div>
  );
}
