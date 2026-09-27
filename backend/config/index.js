/* Configuração central: lê o .env uma única vez e expõe valores já validados. */
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const env = process.env;
const BACKEND_DIR = path.join(__dirname, '..');
const NODE_ENV = env.NODE_ENV || 'development';

function lista(valor) {
  return String(valor || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function inteiro(valor, padrao) {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

const ORIGENS_DEV = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

const PORT = inteiro(env.PORT, 3000);
const semBarraFinal = (u) => String(u).replace(/\/+$/, '');

const config = {
  env: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  port: PORT,
  // Endereços públicos usados nos links enviados ao marceneiro (ficha e 3D)
  // (no Render, RENDER_EXTERNAL_URL é definido automaticamente)
  publicUrl: semBarraFinal(env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`),
  siteUrl: semBarraFinal(env.SITE_URL || env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`),
  backendDir: BACKEND_DIR,
  // Pasta do site: os ficheiros do planejador são partilhados com o backend
  frontendDir: path.resolve(BACKEND_DIR, env.FRONTEND_DIR || '..'),
  serveFrontend: env.SERVE_FRONTEND !== 'false',
  databaseUrl: env.DATABASE_URL || '',
  corsOrigins: lista(env.CORS_ORIGINS).length ? lista(env.CORS_ORIGINS) : NODE_ENV === 'production' ? [] : ORIGENS_DEV,
  logLevel: env.LOG_LEVEL || (NODE_ENV === 'test' ? 'silent' : 'info'),
  ai: {
    apiKey: env.AI_API_KEY || '',
    model: env.AI_MODEL || 'claude-opus-5',
    effort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(env.AI_EFFORT) ? env.AI_EFFORT : 'medium',
    fallbacks: env.AI_FALLBACKS !== 'false',
    rateLimitPerMin: inteiro(env.AI_RATE_LIMIT_PER_MIN, 20)
  },
  // Chave das rotas de administração (listagens, clientes, apagar)
  adminToken: env.ADMIN_TOKEN || '',
  novariEmail: env.NOVARI_EMAIL || 'novarimobiliarioexclusivo@gmail.com',
  // Envio de email: Resend (API HTTP, funciona no Render gratuito, que bloqueia SMTP)
  // ou SMTP (ex.: Gmail com senha de app). Sem nenhum dos dois, não envia.
  email: {
    resendApiKey: env.RESEND_API_KEY || '',
    resendUrl: env.RESEND_API_URL || 'https://api.resend.com/emails',
    smtpHost: env.SMTP_HOST || '',
    smtpPort: inteiro(env.SMTP_PORT, 465),
    smtpUser: env.SMTP_USER || '',
    smtpPass: env.SMTP_PASS || '',
    from:
      env.EMAIL_FROM ||
      (env.RESEND_API_KEY
        ? 'Novari Planejador <onboarding@resend.dev>'
        : `Novari Planejador <${env.SMTP_USER || 'no-reply@localhost'}>`)
  }
};

module.exports = config;
