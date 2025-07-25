import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import { AdminRoute } from "@/lib/admin-route";
import AppLayout from "./components/layout/AppLayout";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Summary from "@/pages/dashboard/Summary";
import { Box, CircularProgress } from "@mui/material";

// Lazy load components for better performance
const TeamDashboard = lazy(() => import("@/pages/dashboard/TeamDashboard"));

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
      
      {/* Admin-only Dashboard routes */}
      <AdminRoute path="/" component={Summary} />
      <AdminRoute 
        path="/team/:id" 
        component={() => (
          <Suspense fallback={<LazyLoadingFallback />}>
            <TeamDashboard />
          </Suspense>
        )} 
      />
      
      {/* No separate DAGs route anymore */}
      
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
