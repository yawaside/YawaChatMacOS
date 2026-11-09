import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import WidgetApp from "./components/WidgetApp";
import ErrorBoundary from "./components/ErrorBoundary";
import { hardenShell } from "./lib/shell";
import { reportStartup } from "./lib/startupReport";

// Самодостаточная страница виджета OBS: лёгкая сборка без кода окна
// приложения — OBS Browser Source парсит только то, что нужно виджету.
hardenShell();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary silent>
      <WidgetApp />
    </ErrorBoundary>
  </StrictMode>,
);

reportStartup("widget");
