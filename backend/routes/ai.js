const { Router } = require('express');
const c = require('../controllers/aiController');
const { limiteIA } = require('../middleware/security');

const router = Router();

router.get('/status', c.estado);
router.post('/', limiteIA, c.conversar);
router.post('/validate', c.validar);

module.exports = router;
