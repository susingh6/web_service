// Minimal App.tsx for debugging
// This is a diagnostic version to identify the issue

function App() {
  console.log("App is rendering!");

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">SLA Monitoring Tool</h1>
      <p className="mb-4">This is a simplified version for debugging.</p>
      
      <div className="p-4 bg-blue-100 rounded">
        <h2 className="text-xl font-semibold mb-2">Test Login</h2>
        <p className="mb-2">Username: azure_test_user</p>
        <p className="mb-2">Password: Azure123!</p>
        <a 
          href="/test-login" 
          className="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Go to Test Login Page
        </a>
      </div>
    </div>
  );
}

export default App;
