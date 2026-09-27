/* Controladores de orçamento (sempre "valor aproximado"). */
const quoteService = require('../services/quoteService');
const engine = require('../services/engine');
const { validar } = require('../validators/common');
const { projetoSchema } = require('../validators/projectSchema');

module.exports = {
  // Lista de módulos do catálogo + material/acabamento
  async estimar(req, res) {
    res.json({ success: true, data: quoteService.estimarModulos(req.body) });
  },
  // Estado completo de um projeto (ainda não guardado)
  async estimarProjeto(req, res) {
    const projeto = engine.normalizar(validar(projetoSchema, req.body, 'Projeto inválido.'));
    res.json({ success: true, data: quoteService.estimarProjeto(projeto) });
  }
};
