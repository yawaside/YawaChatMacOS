import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import DesktopApp from "./components/DesktopApp";
import ErrorBoundary from "./components/ErrorBoundary";
import { hardenShell } from "./lib/shell";
import { reportStartup } from "./lib/startupReport";

hardenShell();

// Страница окна приложения рисует только окно приложения: код оверлея и
// виджета живёт в своих самодостаточных сборках (overlay.html, widget.html),
// поэтому основной бандл меньше и стартует быстрее.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <DesktopApp />
    </ErrorBoundary>
  </StrictMode>,
);

reportStartup("app");
