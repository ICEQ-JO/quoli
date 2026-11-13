import type {
  CodeGraph,
  CodeMap,
  GitState,
  InfraMap,
  SessionDetail,
  SessionSummary,
  ToolCall,
} from "../../shared/model.ts";

export type Lens = "summary" | "review" | "agents" | "map" | "git" | "infra";

export type Selection =
  | { kind: "file"; id: string }
  | { kind: "symbol"; id: string }
  | { kind: "route"; id: string }
  | { kind: "table"; id: string }
  | { kind: "tool"; id: string }
  | { kind: "service"; id: string }
  | { kind: "commit"; id: string }
  | { kind: "branch"; id: string }
  | null;

/** The code graph as the board holds it: absent until requested, `building` while the server parses. */
export interface GraphState {
  graph: CodeGraph | null;
  building: boolean;
  error: string | null;
  retry: () => void;
}

export interface Touch {
  read: number;
  edited: number;
  calls: string[];
}

/** Everything a lens needs. All lenses share one selection and one timeline cursor. */
export interface LensContext {
  projectId: string;
  root: string | null;
  session: SessionDetail | null;
  /** Tool calls up to the timeline cursor, in time order. */
  calls: ToolCall[];
  /** Repo-relative path → how the visible calls touched it. */
  touched: Map<string, Touch>;
  selection: Selection;
  select: (s: Selection, replace?: boolean) => void;
  code: CodeMap | null;
  codeGraph: GraphState;
  git: GitState | null;
  infra: InfraMap | null;
  /** Reload the infra map, e.g. after a service was added by hand. */
  refreshInfra: () => void;
  sessions: SessionSummary[];
  openSession: (id: string) => void;
}

export const isSelected = (s: Selection, kind: NonNullable<Selection>["kind"], id: string) =>
  s?.kind === kind && s.id === id;

/** Files changed by the session that live under a directory ("" = repo root). */
export function editedUnder(touched: Map<string, Touch>, dir: string | null): string[] {
  if (dir === null) return [];
  return [...touched.entries()]
    .filter(([path, t]) => t.edited > 0 && (dir === "" || path.startsWith(`${dir}/`)))
    .map(([path]) => path);
}
