import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { LocalGate } from "./components/LocalGate.tsx";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import "./redesign.css";
import "./a11y.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    {/* Both on the website and on Quoli's own page: the browser must be paired (server/token.ts). */}
    <LocalGate>
      <App />
    </LocalGate>
  </StrictMode>,
);
