import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}kaizen-sw.js`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: "none",
    })
    .then(() => navigator.serviceWorker.ready)
    .catch((error) => console.warn("Kaizen offline cache unavailable", error));
}
