import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Traceframe — the evidence behind the change",
  description: "A local workspace for inspecting available coding-agent evidence.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
