import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import AppLayout from "./components/layout/AppLayout";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Summary from "@/pages/dashboard/Summary";
import TeamDashboard from "@/pages/dashboard/TeamDashboard";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Switch>
          {/* Auth routes - not wrapped in AppLayout */}
          <Route path="/auth">
            <AuthPage />
          </Route>
          
          {/* Protected Dashboard routes - wrapped in AppLayout */}
          <Route path="/">
            <AppLayout>
              <Switch>
                <Route path="/">
                  <Summary />
                </Route>
                <Route path="/team/:id">
                  <TeamDashboard />
                </Route>
                <Route>
                  <NotFound />
                </Route>
              </Switch>
            </AppLayout>
          </Route>
        </Switch>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
