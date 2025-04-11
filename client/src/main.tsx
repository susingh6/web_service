import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Simplest possible rendering without any external dependencies
console.log("Starting simplified application...");

// Create root and render the application
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
  console.log("App rendered to DOM");
} else {
  console.error("Could not find root element!");
}
