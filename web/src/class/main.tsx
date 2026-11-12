import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClassApp } from "./ClassApp.tsx";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "../styles.css";
import "../redesign.css";
import "../a11y.css";
import "./class.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ClassApp />
  </StrictMode>,
);
