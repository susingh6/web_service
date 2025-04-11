import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './queryClient';
import { handleApiResponse } from './apiResponseUtils';
import { useToast } from '@/hooks/use-toast';

/**
 * A generic hook for fetching data with consistent error handling and loading states
 * 
 * @param url API endpoint URL
 * @param options Additional options for the query
 * @returns Query result with data, error, and loading state
 * 
 * @example
 * ```tsx
 * // Simple usage
 * const { data, isLoading, error } = useApiQuery<Team[]>('/api/teams');
 * 
 * // With options
 * const { data, isLoading } = useApiQuery<Entity[]>('/api/entities', {
 *   enabled: !!teamId,
 *   queryKey: ['/api/entities', teamId],
 *   onSuccess: (data) => console.log('Entities loaded:', data.length),
 *   onError: (error) => toast.error(`Failed to load entities: ${error.message}`),
 * });
 * ```
 */
export function useApiQuery<TData>(
  url: string,
  options: {
    enabled?: boolean;
    queryKey?: any[];
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
    staleTime?: number;
    refetchInterval?: number | false;
    refetchOnWindowFocus?: boolean;
  } = {}
) {
  const {
    enabled = true,
    queryKey = [url],
    onSuccess,
    onError,
    staleTime,
    refetchInterval,
    refetchOnWindowFocus,
  } = options;
  
  // Use the toast hook for consistent error messages
  const { toast } = useToast();
  
  return useQuery<TData, Error>({
    queryKey,
    enabled,
    staleTime,
    refetchInterval,
    refetchOnWindowFocus,
    // Custom error handling
    onError: (error) => {
      if (onError) {
        onError(error);
      } else {
        // Default error handling
        toast({
          title: 'Error',
          description: error.message || 'Failed to fetch data',
          variant: 'destructive',
        });
      }
    },
    // Success callback if provided
    onSuccess: onSuccess,
  });
}

/**
 * A generic hook for API mutations (create, update, delete) with consistent error handling
 * 
 * @param url API endpoint URL
 * @param method HTTP method (POST, PUT, PATCH, DELETE)
 * @param options Additional options for the mutation
 * @returns Mutation result with mutate function, loading state, and error
 * 
 * @example
 * ```tsx
 * // Create entity
 * const createMutation = useApiMutation<Entity, CreateEntityInput>(
 *   '/api/entities',
 *   'POST',
 *   {
 *     onSuccess: (data) => {
 *       toast.success('Entity created successfully');
 *       navigate(`/entities/${data.id}`);
 *     },
 *     invalidateQueries: ['/api/entities']
 *   }
 * );
 * 
 * // Usage
 * createMutation.mutate(newEntityData);
 * ```
 */
export function useApiMutation<TData, TVariables = any>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  options: {
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
    invalidateQueries?: (string | string[])[];
    successMessage?: string;
  } = {}
) {
  const {
    onSuccess,
    onError,
    invalidateQueries = [],
    successMessage,
  } = options;
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables) => {
      const response = await apiRequest(method, url, variables);
      
      return handleApiResponse<TData>(
        Promise.resolve(response),
        { errorMessage: `Failed to ${method.toLowerCase()} data` }
      );
    },
    onSuccess: (data) => {
      // Show success toast if message is provided
      if (successMessage) {
        toast({
          title: 'Success',
          description: successMessage,
          variant: 'default',
        });
      }
      
      // Invalidate related queries
      if (invalidateQueries.length > 0) {
        invalidateQueries.forEach((queryKey) => {
          if (Array.isArray(queryKey)) {
            queryClient.invalidateQueries({ queryKey });
          } else {
            queryClient.invalidateQueries({ queryKey: [queryKey] });
          }
        });
      }
      
      // Call custom success handler if provided
      if (onSuccess) {
        onSuccess(data);
      }
    },
    onError: (error) => {
      // Show error toast by default
      toast({
        title: 'Error',
        description: error.message || `Failed to ${method.toLowerCase()} data`,
        variant: 'destructive',
      });
      
      // Call custom error handler if provided
      if (onError) {
        onError(error);
      }
    },
  });
}