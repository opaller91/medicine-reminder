import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// ==============================
// REGISTER SERVICE WORKER
// ==============================

if ("serviceWorker" in navigator) {
  window.addEventListener(
    "load",
    async () => {
      try {
        const registration =
          await navigator.serviceWorker.register(
            "/sw.js"
          );

        console.log(
          "SERVICE WORKER REGISTERED:",
          registration
        );
      } catch (error) {
        console.error(
          "SERVICE WORKER ERROR:",
          error
        );
      }
    }
  );
}

createRoot(
  document.getElementById("root")
).render(
  <StrictMode>
    <App />
  </StrictMode>
);