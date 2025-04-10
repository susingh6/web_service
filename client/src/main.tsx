import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { store } from "./lib/store";
import theme from "./lib/theme";
import App from "./App";
import "./index.css";

// Directly preload DAGs before app loads - fixes issue with dropdown
const DEFAULT_DAGS = ['agg_daily', 'agg_hourly', 'PGM_Freeview_Play_Agg_Daily', 'CHN_agg', 'CHN_billing'];
localStorage.setItem('dags', JSON.stringify(DEFAULT_DAGS));
localStorage.setItem('dags_time', Date.now().toString());
console.log('Preloaded DAG defaults in main.tsx:', DEFAULT_DAGS);

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </Provider>
);
