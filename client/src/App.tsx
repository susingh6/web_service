import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
// Use simplified layout that doesn't depend on auth provider
import SimpleAppLayout from "./components/layout/SimpleAppLayout";
import NotFound from "@/pages/not-found";
// Direct login that doesn't depend on the auth provider
import DirectLoginPage from "@/pages/direct-login";
import Summary from "@/pages/dashboard/Summary";
import TeamDashboard from "@/pages/dashboard/TeamDashboard";

function Router() {
  return (
    <Switch>
      {/* Direct login route - completely bypasses auth provider */}
      <Route path="/login" component={DirectLoginPage} />
      
      {/* Keep the old auth route for compatibility */}
      <Route path="/auth" component={DirectLoginPage} />
      
      {/* Dashboard routes - no longer protected */}
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
      <SimpleAppLayout>
        <Router />
      </SimpleAppLayout>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
