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
import TeamDashboard from "@/pages/dashboard/TeamDashboard";

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
