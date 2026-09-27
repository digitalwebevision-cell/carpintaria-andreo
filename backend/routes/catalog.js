const { Router } = require('express');
const c = require('../controllers/catalogController');

const router = Router();

router.get('/', c.obter);
router.get('/modules/:id', c.modulo);

module.exports = router;
