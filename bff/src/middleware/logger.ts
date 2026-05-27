/* ================================
   请求日志中间件 — 展示 Express 洋葱模型
   每个请求前后各执行一次，记录耗时
   ================================ */

import type { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  console.log(`→ [${req.method}] ${req.path}`);

  // 监听响应结束，记录返回状态和耗时
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const icon = status < 400 ? '✓' : '✗';
    console.log(`← [${req.method}] ${req.path} ${status} ${duration}ms ${icon}`);
  });

  next();
}
