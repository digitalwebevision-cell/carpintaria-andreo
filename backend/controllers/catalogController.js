/* Catálogo de módulos (leitura). */
const catalogService = require('../services/catalogService');
const AppError = require('../utils/AppError');

module.exports = {
  async obter(req, res) {
    const ambiente = typeof req.query.ambiente === 'string' ? req.query.ambiente : undefined;
    res.json({ success: true, data: catalogService.obterCatalogo(ambiente) });
  },
  async modulo(req, res) {
    const m = catalogService.obterModulo(req.params.id);
    if (!m) throw AppError.notFound('MODULE_NOT_FOUND', 'Módulo não encontrado no catálogo.');
    res.json({ success: true, data: m });
  }
};
