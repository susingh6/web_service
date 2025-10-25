import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { store } from "./lib/store";
import theme from "./lib/theme";
import App from "./App";
import "./index.css";
import { preloadAllCacheData, refreshCacheInBackground } from "./lib/preloadCache";

// Preload cache data immediately when the app starts
// This ensures the first modal open is fast
preloadAllCacheData().catch(err => console.error("Error preloading cache:", err));

// Set up a background refresh of cache data every 6 hours
// This matches our CACHE_TTL setting of 6 hours in cacheUtils.ts
setInterval(() => {
  refreshCacheInBackground().catch(err => console.error("Error refreshing cache:", err));
}, 6 * 60 * 60 * 1000); // 6 hour interval

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </Provider>
);
