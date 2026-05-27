/* ================================
   安全中间件 — helmet + cors + rate-limit
   对应 JD: 安全、网络
   ================================ */

import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';

export const securityMiddleware = Router();

// Helmet: 设置安全 HTTP 头（CSP、X-Frame-Options、X-Content-Type-Options 等）
securityMiddleware.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "http://localhost:*"],
    },
  },
}));

// CORS: 跨域请求控制
securityMiddleware.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:8090', 'http://127.0.0.1:5173'],
  credentials: true,
}));

// Rate Limiting: 100 req/s 防止滥用
securityMiddleware.use(rateLimit({
  windowMs: 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));
