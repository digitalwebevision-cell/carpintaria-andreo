/* Controladores de projetos: traduzem HTTP ↔ serviços. */
const projectService = require('../services/projectService');
const submissionService = require('../services/submissionService');

const ok = (res, data, status = 200, extra = {}) => res.status(status).json({ success: true, data, ...extra });

module.exports = {
  async listar(req, res) {
    const { itens, meta } = await projectService.listar(req.query);
    ok(res, itens, 200, { meta });
  },
  async criar(req, res) {
    const p = await projectService.criar(req.body);
    res.location(`/api/projects/${p.id}`);
    ok(res, p, 201);
  },
  async obter(req, res) {
    ok(res, await projectService.obter(req.params.id));
  },
  async substituir(req, res) {
    ok(res, await projectService.substituir(req.params.id, req.body));
  },
  async atualizar(req, res) {
    ok(res, await projectService.atualizarParcial(req.params.id, req.body));
  },
  async remover(req, res) {
    await projectService.remover(req.params.id);
    res.status(204).end();
  },
  async orcamento(req, res) {
    ok(res, await projectService.orcamento(req.params.id));
  },
  async enviar(req, res) {
    ok(res, await submissionService.enviar(req.params.id, req.body), 201);
  },
  async envios(req, res) {
    ok(res, await submissionService.listarEnvios(req.params.id));
  }
};
