import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";
import { applyTheme, readTheme } from "./ui/theme";

applyTheme(readTheme()); // before first paint: no flash of the wrong theme

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("./sw.js");
}
