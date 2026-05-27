/* ================================
   健康检查路由 — 聚合前后端健康状态
   ================================ */

import { Router, type Request, type Response } from 'express';

export function healthRouter(backendUrl: string): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    let backendStatus = 'unknown';
    try {
      const resp = await fetch(`${backendUrl}/health`);
      if (resp.ok) {
        backendStatus = 'ok';
      } else {
        backendStatus = `error: ${resp.status}`;
      }
    } catch {
      backendStatus = 'unreachable';
    }

    res.json({
      status: 'ok',
      service: 'ai-town-bff',
      backend: backendStatus,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
