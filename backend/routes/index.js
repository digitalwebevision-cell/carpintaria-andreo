/* Todas as rotas da API, montadas em /api. */
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../database');
const aiService = require('../services/aiService');
const notificationService = require('../services/notificationService');
const pkg = require('../package.json');

const router = Router();

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60 // máximo de 60 requisições por IP por minuto
});

router.use(apiLimiter);

router.get('/health', async (req, res) => {
  let banco = 'ok';
  try {
    await getDb().raw('select 1');
  } catch {
    banco = 'indisponivel';
  }
  res.status(banco === 'ok' ? 200 : 503).json({
    success: banco === 'ok',
    message: banco === 'ok' ? 'Novari API funcionando.' : 'Novari API sem acesso ao banco de dados.',
    data: { versao: pkg.version, bancoDeDados: banco, ia: { configurada: aiService.estaConfigurada() }, email: { configurado: notificationService.estaConfigurado() } }
  });
});

router.use('/projects', require('./projects'));
router.use('/submissions', require('./submissions'));
router.use('/clients', require('./clients'));
router.use('/quotes', require('./quotes'));
router.use('/catalog', require('./catalog'));
router.use('/ai', require('./ai'));

module.exports = router;
