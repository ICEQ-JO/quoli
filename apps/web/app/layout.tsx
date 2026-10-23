import type { Metadata } from "next";
import "@fontsource-variable/geist";
import "./globals.css";
export const metadata: Metadata = {
  title: "Quoli — the evidence behind the change",
  description: "A local workspace for inspecting available coding-agent evidence.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <span hidden aria-hidden="true" data-design-contract="founder-compact-workbench">
          THESIS: A compact evidence workspace for informed local review. OWN-WORLD: Neutral
          charcoal and white themes, restrained fern selection, readable local Geist type, a grouped
          session register and local source inspection. STORY: Choose a session, read its captured
          request and work, then inspect sources or review gaps. FIRST VIEWPORT: Stable workspace
          navigation and a filterable session table; source detail opens on demand. FORM: Familiar
          session workbench, refined under the owner’s whole-product brief. FINISH: unreviewed and
          undocumented is unfinished; this build ends with the finish review, the verdict, and
          DESIGN.md
        </span>
        <span hidden aria-hidden="true" data-design-contract="quoli-evidence-desk">
          THESIS: Demonstrate an evidence review before describing the machinery. OWN-WORLD:
          Charcoal and white paired surfaces, fern interaction, local Geist, crisp rules and inert
          code. STORY: Inspect changes, recorded checks and unknowns; then start a local sample.
          FIRST VIEWPORT: Direct offer and setup action above a broad interactive evidence desk.
          FORM: Product demonstration, autonomously chosen under the owner’s redesign brief. FINISH:
          unreviewed and undocumented is unfinished; this build ends with the finish review, the
          verdict, and DESIGN.md
        </span>
        {children}
      </body>
    </html>
  );
}
