import type { ReactNode } from "react";
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    sliders: (
      <>
        <path d="M3 6h9m4 0h5M3 12h3m4 0h11M3 18h12m4 0h2" />
        <circle cx="14" cy="6" r="2" />
        <circle cx="8" cy="12" r="2" />
        <circle cx="17" cy="18" r="2" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    moon: <path d="M20.5 14.5A9 9 0 0 1 9.5 3.5a9 9 0 1 0 11 11Z" />,
    brand: (
      <>
        <rect x="2" y="2" width="9" height="9" rx="2" />
        <rect x="13" y="13" width="9" height="9" rx="2" />
        <path d="M7 14v3h3M14 7h3v3" />
      </>
    ),
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    sessions: (
      <>
        <rect x="4" y="4" width="16" height="17" rx="2" />
        <path d="M8 1v6M16 1v6M8 11h8M8 15h5" />
      </>
    ),
    session: (
      <>
        <path d="M6 3h12v18H6zM10 8h4M10 12h4M10 16h2" />
      </>
    ),
    "arrow-left": <path d="m10 5-7 7 7 7M3 12h18" />,
    "arrow-right": <path d="m14 5 7 7-7 7M21 12H3" />,
    shield: (
      <>
        <path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <path d="M6 7v10M18 7v3a4 4 0 0 1-4 4H6" />
      </>
    ),
    "arrow-down": <path d="M12 4v16m-6-6 6 6 6-6" />,
    link: (
      <>
        <path d="m10 13 4-4M8 15l-2 2a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0M14 9l2-2a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    trace: (
      <>
        <path d="M4 4h6v6H4zM14 14h6v6h-6zM14 4h6M17 1v6M4 17h6M7 14v6" />
      </>
    ),
    activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    box: (
      <>
        <path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9" />
      </>
    ),
    arrow: <path d="m8 5 7 7-7 7" />,
    terminal: (
      <>
        <path d="m4 6 5 5-5 5M12 18h8" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    alert: (
      <>
        <path d="m12 3 10 18H2zM12 9v5" />
        <path d="M12 17h.01" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H5v20h14V7zM14 2v5h5M8 12h8M8 16h6" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V6a4 4 0 0 1 8 0v4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.activity}
    </svg>
  );
}
