import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Eye, EyeOff, LogOut } from 'lucide-react';
import monitoringIllustration from '../assets/monitoring-illustration.svg';

// Login form schema
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const AuthPage = () => {
  console.log("AuthPage component rendering");
  const { isAuthenticated, isLoading, loginMutation, loginWithAzure, logout } = useAuth();
  console.log("Auth states:", { isAuthenticated, isLoading });
  const [, navigate] = useLocation();
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    console.log("AuthPage useEffect - auth state:", { isAuthenticated });
    if (isAuthenticated) {
      console.log("User is authenticated, redirecting to /");
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Login form setup
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Handle login form submission
  const onLoginSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(data);
  };

  // Handle Azure AD login - currently just a dummy function
  const handleAzureLogin = () => {
    // Dummy function - button is kept for UI demonstration only
    console.log("Azure AD login button clicked - no action taken");
    // No actual authentication happens
  };

  // Handle explicit logout
  const handleLogout = async () => {
    await logout();
    console.log("User logged out manually from login page");
  };

  // Debug workaround for Replit webview loading issue - don't return early with spinner
  console.log("AuthPage loading state:", isLoading);
  // if (isLoading) {
  //   console.log("AuthPage is in loading state");
  //   return (
  //     <div className="flex items-center justify-center min-h-screen">
  //       <Loader2 className="h-8 w-8 animate-spin text-primary" />
  //     </div>
  //   );
  // }
  
  console.log("AuthPage rendering main form content");

  return (
    <div className="flex min-h-screen relative">
      {/* Logout button fixed at top right */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="outline"
          size="sm"
          className="text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Clear Session
        </Button>
      </div>
      
      {/* Left panel with forms */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">SLA Monitoring Tool</CardTitle>
            <CardDescription className="text-center">
              Sign in to access the SLA monitoring platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mt-4 flex flex-col items-center justify-center">
              <Button
                variant="default"
                type="button"
                size="lg"
                className="w-full relative bg-blue-600 hover:bg-blue-700"
                onClick={handleAzureLogin}
                title="Azure AD integration is not active in this demo"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 23 23"
                  className="h-4 w-4 mr-2"
                  fill="currentColor"
                >
                  <path d="M0 0h10.931v10.931H0zM12.069 0H23v10.931H12.069zM0 12.069h10.931V23H0zM12.069 12.069H23V23H12.069z" />
                </svg>
                Sign in with Azure AD
              </Button>
              
              <div className="relative my-6 w-full">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or sign in with Azure credentials
                  </span>
                </div>
              </div>
              
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4 w-full">
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your username" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              type={showPassword ? "text" : "password"} 
                              placeholder="Enter your password" 
                              {...field} 
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-2.5 text-muted-foreground"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    variant="outline"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Sign In with Credentials
                  </Button>
                </form>
              </Form>
              
              <p className="text-xs text-muted-foreground text-center mt-4">
                <span className="block font-medium mb-1">Demo Credentials:</span>
                Username: <span className="font-mono">azure_test_user</span><br />
                Password: <span className="font-mono">Azure123!</span>
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} SLA Monitoring Tool
          </CardFooter>
        </Card>
      </div>

      {/* Right panel with hero content */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/20 to-primary/5 p-12 flex-col justify-center">
        <div className="max-w-lg">
          <div className="flex justify-start mb-8">
            <img 
              src={monitoringIllustration} 
              alt="SLA Monitoring Dashboard" 
              className="w-64 h-auto"
            />
          </div>
          <h1 className="text-4xl font-bold mb-6">SLA Monitoring Tool</h1>
          <p className="text-xl mb-6">
            Track, analyze, and manage service level agreements across your teams with
            detailed insights and real-time compliance metrics.
          </p>
          <ul className="space-y-3">
            <li className="flex items-center">
              <div className="h-6 w-6 mr-2 rounded-full bg-primary/20 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span>Real-time SLA compliance tracking</span>
            </li>
            <li className="flex items-center">
              <div className="h-6 w-6 mr-2 rounded-full bg-primary/20 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span>Team performance comparisons</span>
            </li>
            <li className="flex items-center">
              <div className="h-6 w-6 mr-2 rounded-full bg-primary/20 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span>Historical performance analytics</span>
            </li>
            <li className="flex items-center">
              <div className="h-6 w-6 mr-2 rounded-full bg-primary/20 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span>Automated alerts and issue tracking</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;