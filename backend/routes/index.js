/* Todas as rotas da API, montadas em /api. */
const { Router } = require('express');
const { getDb } = require('../database');
const aiService = require('../services/aiService');
const pkg = require('../package.json');

const router = Router();

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
    data: { versao: pkg.version, bancoDeDados: banco, ia: { configurada: aiService.estaConfigurada() } }
  });
});

router.use('/projects', require('./projects'));
router.use('/clients', require('./clients'));
router.use('/quotes', require('./quotes'));
router.use('/catalog', require('./catalog'));
router.use('/ai', require('./ai'));

module.exports = router;
