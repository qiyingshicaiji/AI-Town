/* ================================
   API 代理路由 — /api/* → FastAPI 后端
   包括 SSE 流式透传
   ================================ */

import { Router, type Request, type Response } from 'express';

export function apiProxyRouter(backendUrl: string): Router {
  const router = Router();

  // 通用 API 代理
  router.all('/*', async (req: Request, res: Response) => {
    const targetPath = req.originalUrl.replace(/^\/api/, '');
    const targetUrl = `${backendUrl}${targetPath}`;

    try {
      // 检查是否为 SSE 流式端点
      const isSSE = req.path === '/chat/scene';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // 转发原始请求头中的授权信息
      if (req.headers.authorization) {
        headers['Authorization'] = req.headers.authorization as string;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      // 带 body 的请求
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const upstream = await fetch(targetUrl, fetchOptions);

      // SSE 流式透传 — 不缓冲，逐块转发
      if (isSSE && upstream.body) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲

        const reader = upstream.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } finally {
          reader.releaseLock();
          res.end();
        }
        return;
      }

      // 普通 JSON 响应
      const status = upstream.status;
      const data = await upstream.json().catch(() => null);

      res.status(status);
      if (data !== null) {
        res.json(data);
      } else {
        res.end();
      }
    } catch (err) {
      console.error(`[proxy] ${req.method} ${targetUrl} 失败:`, (err as Error).message);
      res.status(502).json({ error: '后端服务不可用', detail: (err as Error).message });
    }
  });

  return router;
}
