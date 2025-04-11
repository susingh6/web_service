import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "@/lib/protected-route";
import AppLayout from "./components/layout/AppLayout";
import { lazy, Suspense } from "react";
import { createDynamicComponent, LoadingComponent } from "./components/DynamicImport";

// Only import Not Found eagerly since it's small and might be needed immediately
import NotFound from "@/pages/not-found";

// Lazy load pages to reduce initial bundle size
const AuthPage = createDynamicComponent(() => import("@/pages/auth-page"));
const Summary = createDynamicComponent(() => import("@/pages/dashboard/Summary"));
const TeamDashboard = createDynamicComponent(() => import("@/pages/dashboard/TeamDashboard"));

function Router() {
  return (
    <Switch>
      {/* Auth routes */}
      <Route path="/auth" component={AuthPage} />
      
      {/* Protected Dashboard routes */}
      <ProtectedRoute path="/" component={Summary} />
      <ProtectedRoute path="/team/:id" component={TeamDashboard} />
      
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
