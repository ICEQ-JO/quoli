import type { Metadata } from "next";
import "@fontsource-variable/geist";
import "./globals.css";
export const metadata: Metadata = {
  title: "Traceframe — the evidence behind the change",
  description: "A local workspace for inspecting available coding-agent evidence.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <span hidden aria-hidden="true" data-design-contract="2f68dc64">
          THESIS: Evidence wayfinding: choose a session, locate uncertainty, follow a recorded
          observation. OWN-WORLD: Ink navigation, porcelain workspace, cobalt selections, compact
          Geist labels, ruled registers and paired evidence panes. STORY: Orient in the workspace,
          open a session, inspect the source before trusting a result. FIRST VIEWPORT: Fixed left
          navigation, workspace title and inline counts, wide session register beside a gap review
          queue. FORM: Municipal wayfinding, grounded direction 7, seed 2f68dc64. FINISH: unreviewed
          and undocumented is unfinished; this build ends with the finish review, the verdict, and
          DESIGN.md
        </span>
        {children}
      </body>
    </html>
  );
}
