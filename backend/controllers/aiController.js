/* Assistente de IA: o navegador nunca fala diretamente com a API de IA. */
const aiService = require('../services/aiService');
const engine = require('../services/engine');
const { z, validar } = require('../validators/common');
const { validarComandos } = require('../validators/actionValidator');

// Estado do projeto enviado pelo frontend (resumoParaIA ou estado completo)
const projetoContexto = z
  .object({
    tipo: z.string().max(40),
    espaco: z.object({ largura: z.number().finite().min(100).max(1200), profundidade: z.number().finite().min(100).max(1000), altura: z.number().finite().min(200).max(400) }),
    modulos: z.array(z.object({ id: z.string().max(60), catalogoId: z.string().max(60).optional() }).passthrough()).max(300).default([])
  })
  .passthrough();

const pedidoIA = z.object({
  mensagem: z.string().trim().min(1, 'A mensagem é obrigatória.').max(2000),
  projeto: projetoContexto,
  historico: z.array(z.object({ autor: z.string().max(20), texto: z.string().max(4000) }).passthrough()).max(80).default([]),
  perguntaAtual: z.string().max(60).nullable().optional()
});

// Aceita os nomes em inglês (message/project/history) e em português (formato do aiParser.js)
function lerPedido(corpo = {}) {
  return validar(
    pedidoIA,
    {
      mensagem: corpo.message ?? corpo.mensagem,
      projeto: corpo.project ?? corpo.projeto,
      historico: corpo.history ?? corpo.historico,
      perguntaAtual: corpo.perguntaAtual
    },
    'Pedido ao assistente inválido.'
  );
}

module.exports = {
  async estado(req, res) {
    res.json({ success: true, data: { configurada: aiService.estaConfigurada() } });
  },

  async conversar(req, res) {
    const pedido = lerPedido(req.body);
    // normaliza o projeto com o motor (preenche padrões, ignora campos estranhos)
    const projeto = engine.normalizar(pedido.projeto);
    const r = await aiService.conversar({ ...pedido, projeto });
    res.json({ success: true, data: r });
  },

  // Valida comandos (da IA ou do frontend) sem chamar a IA
  async validar(req, res) {
    const corpo = req.body || {};
    const { projeto: bruto } = validar(z.object({ projeto: projetoContexto }), { projeto: corpo.project ?? corpo.projeto }, 'Projeto inválido.');
    const acoes = corpo.actions ?? corpo.comandos;
    const projeto = engine.normalizar(bruto);
    const r = validarComandos(acoes, projeto, { permitidos: engine.comandosDisponiveis });
    res.json({ success: true, data: { valid: r.rejeitados.length === 0, actions: r.aceites, rejected: r.rejeitados, preview: r.simulacao } });
  }
};
