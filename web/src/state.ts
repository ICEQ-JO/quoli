import type {
  CodeMap,
  GitState,
  InfraMap,
  SessionDetail,
  SessionSummary,
  ToolCall,
} from "../../shared/model.ts";

export type Lens = "agents" | "code" | "git" | "infra";

export type Selection =
  | { kind: "file"; id: string }
  | { kind: "tool"; id: string }
  | { kind: "service"; id: string }
  | { kind: "commit"; id: string }
  | { kind: "branch"; id: string }
  | null;

export interface Touch {
  read: number;
  edited: number;
  calls: string[];
}

/** Everything a lens needs. All lenses share one selection and one timeline cursor. */
export interface LensContext {
  root: string | null;
  session: SessionDetail | null;
  /** Tool calls up to the timeline cursor, in time order. */
  calls: ToolCall[];
  /** Repo-relative path → how the visible calls touched it. */
  touched: Map<string, Touch>;
  selection: Selection;
  select: (s: Selection) => void;
  code: CodeMap | null;
  git: GitState | null;
  infra: InfraMap | null;
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
