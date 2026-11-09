import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import ProtoDemo from "./ProtoDemo";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ProtoDemo />
  </StrictMode>,
);
