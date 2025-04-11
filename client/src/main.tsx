import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Simplified app bootstrapping - no Redux, no theme provider, no cache preloading
console.log("Mounting minimal SLA Monitoring app");

createRoot(document.getElementById("root")!).render(
  <App />
);
