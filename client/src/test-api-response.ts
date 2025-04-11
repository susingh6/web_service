// Test script to verify API response handling

import { apiRequest } from './lib/queryClient';
import { queryClient } from './lib/queryClient';

async function testAPIs() {
  console.log('=== Testing API Responses ===');
  
  try {
    // Test 1: Standard approach showing raw response
    console.log('\nTest 1: Raw Response Format');
    console.log('Fetching teams using standard approach:');
    const teamsRes = await apiRequest('GET', '/api/teams');
    const teamsData = await teamsRes.json();
    console.log('Raw response:', teamsData);
    console.log('Success?', teamsData.success);
    console.log('Teams count:', teamsData.data.length);
    
    // Test 2: Using the extractData option
    console.log('\nTest 2: Using extractData Option');
    console.log('Fetching dashboard summary with extractData:');
    const dashboardRes = await apiRequest('GET', '/api/dashboard/summary', undefined, { extractData: true });
    const dashboardData = await dashboardRes.json();
    console.log('Extracted data directly:', dashboardData);
    console.log('Metrics:', dashboardData.metrics);
    
    // Test 3: Using React Query's useQuery hook (simulation)
    console.log('\nTest 3: React Query Pattern');
    console.log('Simulating useQuery hook behavior:');
    
    try {
      // Directly use the fetch API in a similar pattern to how queryClient fetches data
      const response = await fetch('/api/teams');
      const responseData = await response.json();
      
      // Extract data from the standardized API response format
      const data = responseData.success ? responseData.data : null;
      
      console.log('Data returned from simulated useQuery:', data);
      console.log('Teams count from useQuery:', Array.isArray(data) ? data.length : 'Not an array');
    } catch (error) {
      console.error('Query simulation error:', error);
    }
    
    // Test 4: Error handling
    console.log('\nTest 4: Error Handling');
    console.log('Testing error response:');
    try {
      const errorRes = await apiRequest('GET', '/api/nonexistent');
      const errorData = await errorRes.json();
      console.log('Response:', errorData);
    } catch (err) {
      console.log('Error caught:', err);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Declare the testAPIs function on the window object
declare global {
  interface Window {
    testAPIs: () => Promise<void>;
  }
}

// Make testAPIs available from the browser console
window.testAPIs = testAPIs;

export {};