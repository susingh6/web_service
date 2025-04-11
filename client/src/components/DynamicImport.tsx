import React, { Suspense, lazy, ComponentType } from 'react';

/**
 * Simple loading component shown while dynamic component is loading
 */
export function LoadingComponent() {
  return (
    <div className="flex justify-center items-center p-4">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

/**
 * Create a dynamically loaded component that only imports when needed
 * @param importFn Function that returns the import promise
 * @param options Configuration options
 * @returns Dynamic component that loads on demand
 */
export function createDynamicComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options?: {
    fallback?: React.ReactNode;
    errorComponent?: React.ReactNode;
  }
) {
  const LazyComponent = lazy(importFn);
  
  return (props: React.ComponentProps<T>) => (
    <Suspense fallback={options?.fallback || <LoadingComponent />}>
      <ErrorBoundary fallback={options?.errorComponent || <ErrorComponent />}>
        <LazyComponent {...props} />
      </ErrorBoundary>
    </Suspense>
  );
}

/**
 * Error fallback component
 */
function ErrorComponent() {
  return (
    <div className="p-4 border border-red-300 bg-red-50 text-red-800 rounded">
      Error loading component. Please try refreshing the page.
    </div>
  );
}

/**
 * Error boundary component to catch errors in dynamic imports
 */
class ErrorBoundary extends React.Component<{
  children: React.ReactNode;
  fallback: React.ReactNode;
}> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    console.error('Dynamic component error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}