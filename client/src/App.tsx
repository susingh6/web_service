import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./lib/authProvider";
import { Toaster } from "@/components/ui/toaster";
import AppLayout from "./components/layout/AppLayout";
import NotFound from "@/pages/not-found";
import Login from "@/pages/auth/Login";
import Summary from "@/pages/dashboard/Summary";
import TeamDashboard from "@/pages/dashboard/TeamDashboard";

function Router() {
  return (
    <Switch>
      {/* Auth routes */}
      <Route path="/auth/login" component={Login} />
      
      {/* Dashboard routes */}
      <Route path="/" component={Summary} />
      <Route path="/team/:id" component={TeamDashboard} />
      
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
