import React, { useState } from 'react';
import { useNavigate } from 'wouter';

/**
 * Minimalist Login Page - works completely independently
 */
export default function MinimalLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [, navigate] = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      setErrorMessage('Please enter both username and password');
      return;
    }
    
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    
    try {
      // Direct fetch call - no React Query, no Auth provider
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setSuccessMessage(`Login successful! Welcome ${data.username}`);
        
        // Redirect to dashboard
        setTimeout(() => {
          navigate('/');
        }, 1000);
      } else {
        // Parse error message if possible
        let message = 'Login failed';
        try {
          const errorData = await response.json();
          message = errorData.message || message;
        } catch (e) {
          // Do nothing - use default message
        }
        setErrorMessage(message);
      }
    } catch (error) {
      setErrorMessage('Network error. Please try again.');
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const createTestUser = async () => {
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    
    try {
      const response = await fetch('/api/test/reset-user');
      
      if (response.ok) {
        const data = await response.json();
        setSuccessMessage(`Test user created! Username: ${data.credentials.username}, Password: ${data.credentials.password}`);
        
        // Auto-fill credentials
        setUsername(data.credentials.username);
        setPassword(data.credentials.password);
      } else {
        setErrorMessage('Failed to create test user');
      }
    } catch (error) {
      setErrorMessage('Network error. Please try again.');
      console.error('Test user creation error:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="mx-auto w-auto">
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            SLA Monitoring Tool
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to access your dashboard
          </p>
        </div>
        
        {errorMessage && (
          <div className="mt-4 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{errorMessage}</div>
          </div>
        )}
        
        {successMessage && (
          <div className="mt-4 rounded-md bg-green-50 p-4">
            <div className="text-sm text-green-700">{successMessage}</div>
          </div>
        )}
        
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="-space-y-px rounded-md shadow-sm">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="relative block w-full rounded-t-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="Username"
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="relative block w-full rounded-b-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="Password"
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 py-2 px-3 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-indigo-400"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
          
          <div className="flex justify-center">
            <button
              type="button"
              onClick={createTestUser}
              disabled={isLoading}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              Create Test User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}