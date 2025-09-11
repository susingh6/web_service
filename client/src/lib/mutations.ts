import { useMutation, useQueryClient } from '@tanstack/react-query';

type OptimisticUpdater<TData> = (old: TData | undefined) => TData;

interface CreateOptimisticMutationOptions<TVars, TData, TContext> {
  mutationFn: (vars: TVars) => Promise<TData>;
  // The query key to optimistically update
  queryKey: (string | object)[];
  // How to apply the optimistic change
  applyOptimisticUpdate?: OptimisticUpdater<any>;
  // How to rollback on error (usually set previous data)
  rollback?: (previousData: any) => any;
  // Invalidate after settle (success or error)
  invalidate?: (queryClient: ReturnType<typeof useQueryClient>) => void | Promise<void>;
}

export function useOptimisticRQMutation<TVars = any, TData = any, TContext = { previousData?: any }>(
  options: CreateOptimisticMutationOptions<TVars, TData, TContext>
) {
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVars, TContext>({
    mutationFn: options.mutationFn,
    onMutate: async (_vars) => {
      await queryClient.cancelQueries({ queryKey: options.queryKey });
      const previousData = queryClient.getQueryData(options.queryKey);
      if (options.applyOptimisticUpdate) {
        queryClient.setQueryData(options.queryKey, options.applyOptimisticUpdate as any);
      }
      return { previousData } as TContext;
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousData !== undefined) {
        queryClient.setQueryData(options.queryKey, options.rollback ? options.rollback(ctx.previousData) : ctx.previousData);
      }
    },
    onSettled: async () => {
      if (options.invalidate) {
        await options.invalidate(queryClient);
      } else {
        await queryClient.invalidateQueries({ queryKey: options.queryKey });
      }
    },
  });
}


