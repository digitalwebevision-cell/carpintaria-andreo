const { Router } = require('express');
const c = require('../controllers/quotesController');

const router = Router();

router.post('/estimate', c.estimar);
router.post('/project', c.estimarProjeto);

module.exports = router;
