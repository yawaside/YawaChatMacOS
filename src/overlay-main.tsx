import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import OverlayApp from "./components/OverlayApp";
import ErrorBoundary from "./components/ErrorBoundary";
import { hardenShell } from "./lib/shell";
import { reportStartup } from "./lib/startupReport";

// Самодостаточная страница оверлея: в окне приложения её кода нет, поэтому
// сбой одного окна не влияет на другое (изолированные сборки).
hardenShell();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary silent>
      <OverlayApp />
    </ErrorBoundary>
  </StrictMode>,
);

reportStartup("overlay");
