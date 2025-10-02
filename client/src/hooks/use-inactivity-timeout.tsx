import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
const WARNING_TIME = 2 * 60 * 1000; // Show warning 2 minutes before logout (at 28 minutes)

export function useInactivityTimeout() {
  const { isAuthenticated, logout } = useAuth();
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningShownRef = useRef(false);

  // Reset the inactivity timer
  const resetTimer = useCallback(() => {
    if (!isAuthenticated) return;

    // Clear existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }

    // Reset warning flag
    warningShownRef.current = false;

    // Set warning timeout (28 minutes)
    warningTimeoutRef.current = setTimeout(() => {
      if (!warningShownRef.current && isAuthenticated) {
        warningShownRef.current = true;
        toast({
          title: "Session Expiring Soon",
          description: "Your session will expire in 2 minutes due to inactivity. Click anywhere to stay logged in.",
          variant: "destructive",
        });
      }
    }, INACTIVITY_TIMEOUT - WARNING_TIME);

    // Set logout timeout (30 minutes)
    timeoutRef.current = setTimeout(() => {
      if (isAuthenticated) {
        toast({
          title: "Session Expired",
          description: "You have been logged out due to 30 minutes of inactivity.",
          variant: "destructive",
        });
        logout();
      }
    }, INACTIVITY_TIMEOUT);
  }, [isAuthenticated, logout, toast]);

  // Activity event handler
  const handleActivity = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    if (!isAuthenticated) {
      // Clear timers when not authenticated
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      return;
    }

    // List of events that indicate user activity
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Start the timer
    resetTimer();

    // Cleanup function
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [isAuthenticated, handleActivity, resetTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, []);
}