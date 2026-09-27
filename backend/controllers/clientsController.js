/* Controladores de clientes. */
const clientService = require('../services/clientService');

const ok = (res, data, status = 200, extra = {}) => res.status(status).json({ success: true, data, ...extra });

module.exports = {
  async listar(req, res) {
    const { itens, meta } = await clientService.listar(req.query);
    ok(res, itens, 200, { meta });
  },
  async criar(req, res) {
    const c = await clientService.criar(req.body);
    res.location(`/api/clients/${c.id}`);
    ok(res, c, 201);
  },
  async obter(req, res) {
    ok(res, await clientService.obter(req.params.id));
  },
  async atualizar(req, res) {
    ok(res, await clientService.atualizar(req.params.id, req.body));
  },
  async remover(req, res) {
    await clientService.remover(req.params.id);
    res.status(204).end();
  },
  async projetos(req, res) {
    const { itens, meta } = await clientService.listarProjetos(req.params.id, req.query);
    ok(res, itens, 200, { meta });
  }
};
