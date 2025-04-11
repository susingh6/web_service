import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { store } from "./lib/store";
import theme from "./lib/theme";
import App from "./App";
import "./index.css";
import { preloadAllCacheData, refreshCacheInBackground, initializeCache } from "./lib/preloadCache";

// Import API test script for debugging
import './test-api-response';

// Initialize empty cache immediately to avoid UI waiting for data
initializeCache();

// Render the app first before loading remote data
const root = createRoot(document.getElementById("root")!);
root.render(
  <Provider store={store}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </Provider>
);

// AFTER the app is rendered, try to load cache data in the background
// This way, if FastAPI or Airflow calls time out, the UI is still usable
setTimeout(() => {
  console.log("Starting background cache loading (post-render)...");
  preloadAllCacheData().catch(err => console.error("Error preloading cache:", err));

  // Set up a background refresh of cache data every 6 hours
  // This matches our CACHE_TTL setting of 6 hours in cacheUtils.ts
  setInterval(() => {
    refreshCacheInBackground().catch(err => console.error("Error refreshing cache:", err));
  }, 6 * 60 * 60 * 1000); // 6 hour interval
}, 1000); // Start loading 1 second after initial render
