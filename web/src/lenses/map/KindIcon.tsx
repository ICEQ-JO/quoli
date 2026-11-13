import type { SymbolKind } from "../../../../shared/model.ts";

export type IconKind = SymbolKind | "route" | "table" | "file" | "folder" | "package";

const PATHS: Record<IconKind, React.ReactNode> = {
  // ƒ-like hook: a function
  function: <path d="M10.5 4.5C8 4.5 8 6 8 8v8c0 2-.5 3.5-3 3.5M5.5 11h6" />,
  "variable-function": (
    <path d="M10.5 4.5C8 4.5 8 6 8 8v8c0 2-.5 3.5-3 3.5M5.5 11h6M14 13l4 4M18 13l-4 4" />
  ),
  method: (
    <>
      <path d="M5 19V6l3.5 7L12 6v13" />
      <circle cx="18" cy="17" r="1.8" />
    </>
  ),
  class: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      <path d="M4.5 10h15" />
    </>
  ),
  component: <path d="M12 3.5l7 4v9l-7 4-7-4v-9z" />,
  module: (
    <path d="M8 4.5H6.5a1.5 1.5 0 00-1.5 1.5v12a1.5 1.5 0 001.5 1.5H8M16 4.5h1.5A1.5 1.5 0 0119 6v12a1.5 1.5 0 01-1.5 1.5H16" />
  ),
  route: <path d="M5 7h9a3 3 0 010 6H8a3 3 0 000 6h11M17 16l2 3-2 3" />,
  table: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16M10 10v9" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.5h6.5L18 8v12.5H7z" />
      <path d="M13.5 3.5V8H18" />
    </>
  ),
  folder: <path d="M3.5 7.5a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />,
  package: (
    <>
      <path d="M12 3.5l8 4.2v8.6l-8 4.2-8-4.2V7.7z" />
      <path d="M4 7.7l8 4.3 8-4.3M12 12v8.5" />
    </>
  ),
};

/** A 16px kind icon drawn in `currentColor`; the kind is also written out wherever it matters. */
export function KindIcon({ kind, size = 16 }: { kind: IconKind; size?: number }) {
  return (
    <svg
      className="kind-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  );
}
