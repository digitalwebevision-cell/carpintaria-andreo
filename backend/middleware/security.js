/* CORS, limite de pedidos à IA e proteção dos ficheiros estáticos. */
const path = require('node:path');
const { timingSafeEqual } = require('node:crypto');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const AppError = require('../utils/AppError');

// Só as origens configuradas podem chamar a API a partir do navegador.
// Pedidos sem Origin (curl, mesma origem) não são afetados pelo CORS.
const corsApi = cors({
  origin(origin, callback) {
    callback(null, !origin || config.corsOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600
});

// A IA tem custo por pedido: limitar por IP
const limiteIA = rateLimit({
  windowMs: 60 * 1000,
  limit: config.ai.rateLimitPerMin,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => next(new AppError(429, 'TOO_MANY_REQUESTS', 'Demasiados pedidos ao assistente. Aguarde um minuto.'))
});

// Ao servir o site, nunca expor o backend (.env, banco SQLite), git, etc.
const BLOQUEADOS = /^\/(backend|\.git|\.vscode|node_modules)(\/|$)/i;
function protegerEstaticos(req, res, next) {
  let caminho;
  try {
    caminho = path.posix.normalize(decodeURIComponent(req.path));
  } catch {
    return res.status(400).end();
  }
  if (BLOQUEADOS.test(caminho) || /\.py$/i.test(caminho)) return res.status(404).end();
  next();
}

// Rotas de administração (listar projetos, clientes, histórico de envios, apagar):
// exigem "Authorization: Bearer <ADMIN_TOKEN>". Em produção, sem ADMIN_TOKEN
// definido ficam fechadas; em desenvolvimento e testes ficam abertas.
function iguais(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function exigirAdmin(req, res, next) {
  const token = config.adminToken;
  if (!token) {
    if (!config.isProduction) return next();
    return next(new AppError(403, 'ADMIN_DISABLED', 'Rota de administração desativada (defina ADMIN_TOKEN).'));
  }
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (m && iguais(m[1], token)) return next();
  next(new AppError(401, 'UNAUTHORIZED', 'Acesso reservado à administração da Novari.'));
}

module.exports = { corsApi, limiteIA, protegerEstaticos, exigirAdmin };
