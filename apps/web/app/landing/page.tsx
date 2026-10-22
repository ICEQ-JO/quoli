import { LandingPage } from "../components/landing/landing-page";

export const metadata = {
  title: "Traceframe — The Agent Flight Recorder",
  description:
    "Show me what my coding agent did, what changed, and what remains unverified. Local-first flight recorder for Claude Code.",
};

export default function Page() {
  return <LandingPage />;
}
