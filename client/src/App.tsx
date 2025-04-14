import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "@/lib/protected-route";
import AppLayout from "./components/layout/AppLayout";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Summary from "@/pages/dashboard/Summary";
import { Box, CircularProgress } from "@mui/material";

// Lazy load components for better performance
const TeamDashboard = lazy(() => import("@/pages/dashboard/TeamDashboard"));
const DagsPage = lazy(() => import("@/pages/dashboard/DagsPage"));

// Loading fallback for lazy-loaded components
const LazyLoadingFallback = () => (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
    <CircularProgress />
  </Box>
);

function Router() {
  return (
    <Switch>
      {/* Auth routes */}
      <Route path="/auth" component={AuthPage} />
      
      {/* Protected Dashboard routes */}
      <ProtectedRoute path="/" component={Summary} />
      <ProtectedRoute 
        path="/team/:id" 
        component={() => (
          <Suspense fallback={<LazyLoadingFallback />}>
            <TeamDashboard />
          </Suspense>
        )} 
      />
      
      {/* SLA Entity routes */}
      <ProtectedRoute 
        path="/dags" 
        component={() => (
          <Suspense fallback={<LazyLoadingFallback />}>
            <DagsPage />
          </Suspense>
        )} 
      />
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppLayout>
          <Router />
        </AppLayout>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
