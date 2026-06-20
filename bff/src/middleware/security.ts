/* ================================
   安全中间件 — helmet + cors + rate-limit
   对应 JD: 安全、网络
   ================================ */

import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';

export const securityMiddleware = Router();

// Helmet: 安全 HTTP 头（HTTP 部署时关闭 HTTPS 专属策略）
securityMiddleware.use(helmet({
  contentSecurityPolicy: {
    // 禁用默认值，否则 helmet 会自动注入 upgrade-insecure-requests，
    // 导致浏览器把所有 HTTP 子资源请求强制升级为 HTTPS → SSL 错误
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "http://localhost:*"],
    },
  },
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  strictTransportSecurity: false,
}));

// CORS: 跨域请求控制（HTTP 部署允许任意来源，否则 JS 资源加载会被拦截）
securityMiddleware.use(cors({
  origin: '*',
  credentials: false,
}));

// Rate Limiting: 100 req/s 防止滥用
securityMiddleware.use(rateLimit({
  windowMs: 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));
