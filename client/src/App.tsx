import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "@/lib/protected-route";
import AppLayout from "./components/layout/AppLayout";
import { lazy, Suspense, useState, useEffect } from "react";
import { createDynamicComponent, LoadingComponent } from "./components/DynamicImport";

// Only import Not Found eagerly since it's small and might be needed immediately
import NotFound from "@/pages/not-found";

// Import Auth Page directly to avoid lazy loading issues during development
import AuthPage from "@/pages/auth-page";

// Lazy load dashboard pages
const Summary = createDynamicComponent(() => import("@/pages/dashboard/Summary"));
const TeamDashboard = createDynamicComponent(() => import("@/pages/dashboard/TeamDashboard"));

function Router() {
  // For debugging - log when router renders
  console.log("Router component rendering");
  
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
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Ensure app has time to initialize
  useEffect(() => {
    console.log("App component mounted");
    
    // Mark as initialized after a short delay
    const timer = setTimeout(() => {
      console.log("App initialization completed");
      setIsInitialized(true);
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Show loading indicator during initialization
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <span className="ml-3">Loading application...</span>
      </div>
    );
  }
  
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
