import { useCallback, useRef } from 'react';
import { apiRequest, invalidateCache } from '../api/client';

/**
 * 封装 API 请求的 Hook — 提供 loading / error 状态管理。
 * 副作用隔离：组件不直接调用 fetch，通过此 hook 管理网络 I/O。
 */
export function useApi() {
  const loadingRef = useRef<Set<string>>(new Set());

  const request = useCallback(async <T>(
    method: string,
    path: string,
    body: unknown = null,
    options?: { useCache?: boolean; cacheTTL?: number }
  ): Promise<T> => {
    const key = `${method}:${path}`;
    loadingRef.current.add(key);
    try {
      return await apiRequest<T>(method, path, body, options);
    } finally {
      loadingRef.current.delete(key);
    }
  }, []);

  const isLoading = useCallback((method: string, path: string) => {
    return loadingRef.current.has(`${method}:${path}`);
  }, []);

  return { request, isLoading, invalidateCache };
}
