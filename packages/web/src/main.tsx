import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./design-system/tokens.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root 不存在");
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
