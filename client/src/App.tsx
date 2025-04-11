import React, { useState } from "react";
import { Toaster } from "@/components/ui/toaster";

// Super simple emergency app with no dependencies

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    setError("");
    
    try {
      // Make API call to login
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });
      
      if (response.ok) {
        setIsLoggedIn(true);
      } else {
        setError("Invalid username or password");
      }
    } catch (err) {
      setError("Network error. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const createTestUser = async () => {
    setLoading(true);
    setError("");
    
    try {
      const response = await fetch("/api/test/reset-user");
      const data = await response.json();
      
      if (response.ok) {
        setUsername(data.credentials.username);
        setPassword(data.credentials.password);
        alert(`Test user created!\nUsername: ${data.credentials.username}\nPassword: ${data.credentials.password}`);
      } else {
        setError("Failed to create test user");
      }
    } catch (err) {
      setError("Network error. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Very simple dashboard
  if (isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="bg-indigo-600 text-white p-4 shadow">
          <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-bold">SLA Monitoring Dashboard</h1>
            <button 
              onClick={() => setIsLoggedIn(false)}
              className="bg-white text-indigo-600 px-4 py-2 rounded shadow hover:bg-gray-100"
            >
              Log Out
            </button>
          </div>
        </header>
        
        <main className="container mx-auto py-8 px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-2">Overall Compliance</h2>
              <p className="text-4xl font-bold text-green-500">98.5%</p>
              <p className="text-sm text-gray-500 mt-2">+2.3% from last month</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-2">Tables Compliance</h2>
              <p className="text-4xl font-bold text-green-500">99.1%</p>
              <p className="text-sm text-gray-500 mt-2">+1.5% from last month</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-2">DAGs Compliance</h2>
              <p className="text-4xl font-bold text-yellow-500">94.8%</p>
              <p className="text-sm text-gray-500 mt-2">-0.7% from last month</p>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-xl font-semibold mb-4">Team Performance</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-medium">PGM</span>
                  <span className="text-green-600">99.2%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-green-600 h-2.5 rounded-full" style={{ width: "99.2%" }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-medium">Core</span>
                  <span className="text-green-600">97.8%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-green-600 h-2.5 rounded-full" style={{ width: "97.8%" }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-medium">Viewer Product</span>
                  <span className="text-yellow-500">94.5%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-yellow-500 h-2.5 rounded-full" style={{ width: "94.5%" }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-medium">IOT</span>
                  <span className="text-green-600">98.1%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-green-600 h-2.5 rounded-full" style={{ width: "98.1%" }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-medium">CDM</span>
                  <span className="text-yellow-500">95.7%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-yellow-500 h-2.5 rounded-full" style={{ width: "95.7%" }}></div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Recent Issues</h2>
              <button className="text-indigo-600 hover:text-indigo-800">View All</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap">agg_daily</td>
                    <td className="px-6 py-4 whitespace-nowrap">DAG</td>
                    <td className="px-6 py-4 whitespace-nowrap">PGM</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        Failed
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">2025-04-10</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap">users_table</td>
                    <td className="px-6 py-4 whitespace-nowrap">Table</td>
                    <td className="px-6 py-4 whitespace-nowrap">Core</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        Warning
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">2025-04-09</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap">PGM_Freeview_Play_Agg_Daily</td>
                    <td className="px-6 py-4 whitespace-nowrap">DAG</td>
                    <td className="px-6 py-4 whitespace-nowrap">CDM</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Resolved
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">2025-04-08</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Super simple login form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            SLA Monitoring Tool
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to access your dashboard
          </p>
        </div>
        
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}
        
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Username"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>
          
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={createTestUser}
              disabled={loading}
              className="text-sm text-indigo-600 hover:text-indigo-900"
            >
              Create Test User
            </button>
          </div>
        </form>
      </div>
      <Toaster />
    </div>
  );
}

export default App;
