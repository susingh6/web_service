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
          <ProtectedRoute path="/">
            <AppLayout>
              <Summary />
            </AppLayout>
          </ProtectedRoute>
          
          <ProtectedRoute path="/team/:id">
            <AppLayout>
              <TeamDashboard />
            </AppLayout>
          </ProtectedRoute>
          
          {/* Fallback to 404 */}
          <Route>
            <NotFound />
          </Route>
        </Switch>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
