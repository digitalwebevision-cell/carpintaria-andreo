const { Router } = require('express');
const c = require('../controllers/projectsController');

const router = Router();

router.get('/', c.listar);
router.post('/', c.criar);
router.get('/:id', c.obter);
router.put('/:id', c.substituir);
router.patch('/:id', c.atualizar);
router.delete('/:id', c.remover);
router.get('/:id/quote', c.orcamento);
router.post('/:id/send', c.enviar);
router.get('/:id/submissions', c.envios);

module.exports = router;
