const { Router } = require('express');
const c = require('../controllers/submissionsController');

const router = Router();

router.get('/:id/ficha', c.ficha);
router.get('/:id/vistas/:ordem', c.vista);

module.exports = router;
