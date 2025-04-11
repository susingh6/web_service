// Test script to verify API response handling

import { apiRequest } from './lib/queryClient';

async function testAPIs() {
  console.log('=== Testing API Responses ===');
  
  try {
    // Test get teams
    console.log('\nFetching teams:');
    const teamsRes = await apiRequest('GET', '/api/teams');
    const teamsData = await teamsRes.json();
    console.log('Success?', teamsData.success);
    console.log('Teams count:', teamsData.data.length);
    
    // Test get dashboard summary
    console.log('\nFetching dashboard summary:');
    const dashboardRes = await apiRequest('GET', '/api/dashboard/summary');
    const dashboardData = await dashboardRes.json();
    console.log('Success?', dashboardData.success);
    console.log('Message:', dashboardData.message);
    console.log('Metrics:', dashboardData.data.metrics);
    
    // Test error handling (invalid endpoint)
    console.log('\nTesting error response:');
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