import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AppStoreProvider } from "./app/AppStore";
import { App } from "./app/App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <AppStoreProvider>
        <App />
      </AppStoreProvider>
    </HashRouter>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const entry = document.querySelector<HTMLScriptElement>("#reps-app-script");
    const base = entry?.dataset.appBase || "./";
    void navigator.serviceWorker.register(new URL(`${base}sw.js`, document.baseURI)).catch(() => undefined);
  });
}
