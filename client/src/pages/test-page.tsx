import React from 'react';

export default function TestPage() {
  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Test Page</h1>
      <p>This is a simple test page to verify that the Replit webview is functioning correctly.</p>
      <p>If you can see this content, the webview is working but there might be an issue with the authentication system.</p>
      
      <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>Debug Information</h2>
        <p>Current time: {new Date().toLocaleTimeString()}</p>
        <p>Browser info: {navigator.userAgent}</p>
      </div>
      
      <button
        style={{
          marginTop: '20px',
          padding: '10px 20px',
          backgroundColor: '#4285f4',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
        onClick={() => {
          console.log('Test button clicked');
          alert('Button click works!');
        }}
      >
        Click Me to Test Interactivity
      </button>
    </div>
  );
}