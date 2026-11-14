import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fuentes empaquetadas con la app: no se piden a Google (más privado y funciona con la CSP estricta)
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./estilos.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
