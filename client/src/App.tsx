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
import SimpleLogin from "@/pages/simple-login";

function Router() {
  console.log("Initializing Router");
  return (
    <Switch>
      {/* Auth routes - using simple login page directly */}
      <Route path="/" component={SimpleLogin} />
      <Route path="/auth" component={SimpleLogin} />
      
      {/* Protected Dashboard routes */}
      <ProtectedRoute path="/dashboard" component={Summary} />
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
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
