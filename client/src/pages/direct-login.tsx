import { useState } from 'react';

/**
 * Direct Login Page - Completely standalone login page that doesn't depend on auth provider
 * This is a temporary solution to bypass Azure AD integration issues
 */
const DirectLoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      console.log('Attempting login with:', { username, password });
      
      // Direct API call to login endpoint
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const userData = await response.json();
        console.log('Login successful:', userData);
        setSuccess(`Login successful! Welcome, ${userData.username || 'user'}!`);
        
        // Redirect to home page after successful login
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      } else {
        // Try to parse error response
        try {
          const errorData = await response.json();
          setError(`Login failed: ${errorData.message || 'Unknown error'}`);
        } catch (e) {
          setError(`Login failed: ${response.statusText}`);
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setError(`Login error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // First, let's create a test user if it doesn't exist
  const createTestUser = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/test/reset-user');
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(`Test user created successfully. You can login with:\nUsername: ${data.credentials.username}\nPassword: ${data.credentials.password}`);
        // Auto-fill the credentials
        setUsername(data.credentials.username);
        setPassword(data.credentials.password);
      } else {
        setError(`Failed to create test user: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating test user:', error);
      setError(`Error creating test user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      padding: '1rem',
      backgroundColor: '#f9fafb'
    }}>
      <div style={{ 
        backgroundColor: 'white', 
        padding: '2rem', 
        borderRadius: '0.5rem',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '1rem', color: '#111827' }}>
          SLA Monitoring Tool
        </h1>
        <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#6b7280' }}>
          Sign in to access the dashboard
        </p>
        
        {error && (
          <div style={{ 
            padding: '0.75rem',
            backgroundColor: '#fee2e2', 
            color: '#b91c1c',
            borderRadius: '0.25rem',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}
        
        {success && (
          <div style={{ 
            padding: '0.75rem',
            backgroundColor: '#d1fae5', 
            color: '#047857',
            borderRadius: '0.25rem',
            marginBottom: '1rem'
          }}>
            {success}
          </div>
        )}
        
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#374151' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.625rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
              placeholder="Enter your username"
              required
            />
          </div>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#374151' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.625rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
              placeholder="Enter your password"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            style={{ 
              width: '100%', 
              padding: '0.625rem',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: '#4f46e5',
              color: 'white',
              fontWeight: 'medium',
              fontSize: '0.875rem',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1
            }}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button 
            onClick={createTestUser}
            disabled={isLoading}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#4f46e5',
              textDecoration: 'underline',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Create Test User
          </button>
        </div>
        
        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
          © {new Date().getFullYear()} SLA Monitoring Tool
        </p>
      </div>
    </div>
  );
};

export default DirectLoginPage;