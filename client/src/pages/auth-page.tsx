import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import monitoringIllustration from '../assets/monitoring-illustration.svg';

const AuthPage = () => {
  const { isAuthenticated, isLoading, loginWithAzure } = useAuth();
  const [, navigate] = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Handle authentication - for now this will use test credentials until Azure is configured
  const handleAuthenticate = async () => {
    try {
      await loginWithAzure();
    } catch (error) {
      console.error("Authentication error:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel with forms */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md min-h-[500px] flex flex-col justify-between">
          <CardHeader className="pb-8">
            <CardTitle className="text-2xl text-center">SLA Management Tool</CardTitle>
            <CardDescription className="text-center">
              Sign in to access the SLA management platform
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center items-center">
            <div className="w-full space-y-8">
              <div className="text-center">
                <h3 className="text-4xl font-semibold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent tracking-wide" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                  Log In
                </h3>
              </div>
              
              <Button
                variant="default"
                type="button"
                size="lg"
                className="w-full"
                onClick={handleAuthenticate}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
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
                )}
                Authenticate
              </Button>
              
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Enterprise SSO authentication with Azure AD
                </p>
                <p className="text-xs text-muted-foreground">
                  Click "Authenticate" to access the SLA management platform
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center text-sm text-muted-foreground pt-8">
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
          <h1 className="text-4xl font-bold mb-6">SLA Management Tool</h1>
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