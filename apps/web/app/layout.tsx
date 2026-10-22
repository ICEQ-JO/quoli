import type { Metadata } from "next";
import "@fontsource-variable/geist";
import "./globals.css";
export const metadata: Metadata = {
  title: "Traceframe — the evidence behind the change",
  description: "A local workspace for inspecting available coding-agent evidence.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <span hidden aria-hidden="true" data-design-contract="founder-compact-workbench">
          THESIS: A compact evidence workspace, following the founder's Linear reference. OWN-WORLD:
          Neutral charcoal and off-white themes, restrained violet selection, readable Geist type, a
          grouped session register and local source inspection. STORY: Choose a session, read its
          captured request and work, then inspect sources or review gaps. FIRST VIEWPORT: Stable
          workspace navigation and a filterable session table; source detail opens on demand. FORM:
          Founder-pinned familiar SaaS workbench. FINISH: unreviewed and undocumented is unfinished;
          this build ends with the finish review, the verdict, and DESIGN.md
        </span>
        {children}
      </body>
    </html>
  );
}
