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
  // A new version is waiting when a fresh service worker installs while an old one controls the page:
  // tell the Shell (it shows "New version · Reload"). Also check for updates whenever the app comes back.
  void navigator.serviceWorker.register("./sw.js").then((reg) => {
    const announce = () => window.dispatchEvent(new CustomEvent("reps-update"));
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      sw?.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) announce();
      });
    });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void reg.update(); });
  });
}
