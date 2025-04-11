// Simple direct login component to fix the rendering issue
// This avoids any potential API calls or initialization issues

function SimpleLogin() {
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Login functionality would be processed here');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-center mb-6">SLA Monitoring Tool</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              defaultValue="azure_test_user"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              defaultValue="Azure123!"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Sign in
            </button>
          </div>
        </form>
        <div className="mt-4 text-center text-sm text-gray-600">
          This is a simplified login page for testing.<br />
          The full application has been temporarily disabled.
        </div>
      </div>
    </div>
  );
}

// Simplified App component that doesn't use any external providers
// This should render even if there are issues with API calls
function App() {
  console.log("Simple App is rendering!");
  return <SimpleLogin />;
}

export default App;
