const { Router } = require('express');
const c = require('../controllers/clientsController');

const router = Router();

router.get('/', c.listar);
router.post('/', c.criar);
router.get('/:id', c.obter);
router.patch('/:id', c.atualizar);
router.delete('/:id', c.remover);
router.get('/:id/projects', c.projetos);

module.exports = router;
