import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Quoli — the evidence behind the change",
  description: "A local workspace for inspecting available coding-agent evidence.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <span hidden aria-hidden="true" data-design-contract="quoli-evidence-field-document">
          THESIS: Read the captured request, then inspect the evidence behind it. OWN-WORLD: Black
          and white fields, neutral rules, local Inter, Instrument Serif italic titles, restrained
          evidence colors. STORY: Choose a session, read its document, inspect a source or review an
          unknown. FIRST VIEWPORT: Stable navigation, a readable document and a contextual
          inspector; no neighboring-session rail. FORM: Owner-approved B, Document first, within D,
          Evidence Field. FINISH: unreviewed and undocumented is unfinished; this build ends with
          the finish review, the verdict, and DESIGN.md
        </span>
        {children}
      </body>
    </html>
  );
}
