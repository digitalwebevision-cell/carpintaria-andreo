const { Router } = require('express');
const c = require('../controllers/projectsController');
const { exigirAdmin } = require('../middleware/security');

const router = Router();

// O planejador só cria, lê, grava e envia o seu projeto (pelo ID);
// listar, apagar e ver o histórico é administração.
router.get('/', exigirAdmin, c.listar);
router.post('/', c.criar);
router.get('/:id', c.obter);
router.put('/:id', c.substituir);
router.patch('/:id', c.atualizar);
router.delete('/:id', exigirAdmin, c.remover);
router.get('/:id/quote', c.orcamento);
router.post('/:id/send', c.enviar);
router.get('/:id/submissions', exigirAdmin, c.envios);

module.exports = router;
