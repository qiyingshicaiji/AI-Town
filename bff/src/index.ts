/* ================================
   Express BFF 服务入口
   洋葱模型中处于最外层，串联所有中间件
   ================================ */

import express from 'express';
import path from 'path';
import { requestLogger } from './middleware/logger';
import { securityMiddleware } from './middleware/security';
import { apiProxyRouter } from './routes/api';
import { healthRouter } from './routes/health';

const app = express();
const PORT = process.env.BFF_PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

// ---- 中间件链（洋葱模型） ----
// 1. 请求日志 — 记录每个请求的 method/path/耗时
app.use(requestLogger);

// 2. 安全中间件 — helmet + cors + rate-limit
app.use(securityMiddleware);

// 3. 压缩 — gzip/brotli 压缩响应
import compression from 'compression';
app.use(compression());

// 4. JSON 解析
app.use(express.json());

// ---- 路由 ----
// 健康检查
app.use('/health', healthRouter(BACKEND_URL));

// API 代理 → FastAPI
app.use('/api', apiProxyRouter(BACKEND_URL));

// 生产环境：托管 React 构建产物
const staticDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(staticDir));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// ---- 启动 ----
app.listen(PORT, () => {
  console.log(`[BFF] Express 中间层启动 → http://localhost:${PORT}`);
  console.log(`[BFF] 后端代理 → ${BACKEND_URL}`);
  console.log(`[BFF] 中间件链: logger → security → compression → proxy`);
  console.log(`[BFF] 静态文件 → ${staticDir}`);
});

export default app;
