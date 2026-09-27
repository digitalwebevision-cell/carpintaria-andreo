/* ============================================================
   POST /api/projects/:id/send — enviar o projeto à Novari.
   1. valida o projeto e os contactos do cliente
   2. associa (ou cria, sem duplicar) o cliente
   3. gera resumo em texto + especificações técnicas + valor aproximado
   4. regista o envio no banco
   5. notifica a Novari (email, quando configurado)
   ============================================================ */
const { getDb } = require('../database');
const config = require('../config');
const projectModel = require('../models/projectModel');
const clientModel = require('../models/clientModel');
const submissionModel = require('../models/submissionModel');
const projectService = require('./projectService');
const clientService = require('./clientService');
const quoteService = require('./quoteService');
const notificationService = require('./notificationService');
const engine = require('./engine');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { z, validar } = require('../validators/common');
const { agora } = require('../utils/helpers');

const C = engine.Catalogo;

const pedidoEnvio = z
  .object({
    cliente: z
      .object({
        nome: z.string().trim().min(1).max(160),
        email: z.string().trim().max(254).optional().nullable(),
        telefone: z.string().trim().max(40).optional().nullable(),
        observacoes: z.string().max(5000).optional().nullable()
      })
      .optional(),
    observacoes: z.string().max(5000).optional()
  })
  .strict();

const dim = (d) => `${d.largura} × ${d.altura} × ${d.profundidade} cm`;

function gerarEspecificacoes(p) {
  return {
    ambiente: p.tipo,
    espaco: p.espaco,
    material: p.material,
    acabamento: p.acabamento,
    estilo: p.estilo,
    eletrodomesticos: p.eletrodomesticos,
    preferencias: p.preferencias,
    portas: p.portas,
    janelas: p.janelas,
    pontos: p.pontos,
    modulos: p.modulos.map((m) => ({
      id: m.id,
      catalogoId: m.catalogoId,
      nome: m.nome,
      parede: m.parede,
      posicao: m.posicao,
      rotacao: m.rotacao,
      dimensoes: m.dimensoes,
      componentes: m.componentes
    }))
  };
}

function gerarResumo({ projeto, cliente, orcamento, observacoes }) {
  const p = projeto.dados;
  const linhasModulos = p.modulos.map((m) => `- ${m.nome} (${dim(m.dimensoes)})`).join('\n');
  return [
    'NOVO PROJETO RECEBIDO',
    '',
    'CLIENTE',
    `Nome: ${cliente.nome}`,
    `Email: ${cliente.email || 'Não informado'}`,
    `Telefone: ${cliente.telefone || 'Não informado'}`,
    '',
    'PROJETO',
    `Código: ${projeto.id}`,
    `Nome: ${projeto.nome}`,
    `Tipo: ${C.AMBIENTES[p.tipo] || p.tipo}`,
    `Dimensões: ${p.espaco.largura} × ${p.espaco.profundidade} × ${p.espaco.altura} cm`,
    `Material: ${(C.MATERIAIS[p.material] || {}).nome || p.material}`,
    `Acabamento: ${p.acabamento}`,
    `Estilo: ${(C.ESTILOS[p.estilo] || C.ESTILOS.moderno).nome}`,
    '',
    'CONFIGURAÇÃO',
    linhasModulos || 'Nenhum módulo definido.',
    '',
    'VALOR APROXIMADO (não é orçamento final)',
    orcamento.valorFormatado,
    '',
    'OBSERVAÇÕES',
    [p.observacoes, observacoes].filter(Boolean).join(' ') || 'Sem observações adicionais.'
  ].join('\n');
}

async function enviar(id, corpo) {
  const pedido = validar(pedidoEnvio, corpo || {}, 'Pedido de envio inválido.');
  const projeto = await projectService.obterRegisto(id);

  if (!projeto.dados.modulos || !projeto.dados.modulos.length) {
    throw new AppError(422, 'PROJECT_EMPTY', 'O projeto não tem módulos. Monte o projeto antes de o enviar.');
  }
  if (pedido.cliente && !pedido.cliente.email && !pedido.cliente.telefone) {
    throw AppError.validation([{ campo: 'cliente', mensagem: 'Indique um email ou telefone para contacto.' }], 'Contacto do cliente em falta.');
  }
  if (!pedido.cliente && !projeto.clienteId) {
    throw new AppError(422, 'CLIENT_REQUIRED', 'Indique os dados de contacto do cliente (nome e email ou telefone).');
  }

  const orcamento = quoteService.estimarProjeto(projeto.dados);

  const { envio, cliente } = await getDb().transaction(async (trx) => {
    const cli = pedido.cliente ? await clientService.encontrarOuCriar(pedido.cliente, trx) : await clientModel.obter(projeto.clienteId, trx);
    if (!cli) throw new AppError(422, 'CLIENT_NOT_FOUND', 'O cliente associado ao projeto não existe.');
    const enviadoEm = agora();
    await projectModel.atualizar(projeto.id, { clienteId: cli.id, enviadoEm, orcamentoEstimado: orcamento.valorAproximado }, trx);
    const resumo = gerarResumo({ projeto, cliente: cli, orcamento, observacoes: pedido.observacoes });
    const registo = await submissionModel.criar(
      {
        projetoId: projeto.id,
        clienteId: cli.id,
        destino: config.novariEmail,
        status: 'registado',
        resumo,
        especificacoes: gerarEspecificacoes(projeto.dados),
        orcamentoEstimado: orcamento.valorAproximado
      },
      trx
    );
    return { envio: registo, cliente: cli };
  });

  logger.info('Projeto enviado para a Novari', { projetoId: projeto.id, envioId: envio.id, modulos: projeto.dados.modulos.length });

  let notificacao;
  try {
    notificacao = await notificationService.notificarNovoProjeto({ envio, resumo: envio.resumo });
  } catch (e) {
    logger.error('Falha ao notificar a Novari', e);
    notificacao = { enviado: false, motivo: 'ERRO_NO_ENVIO' };
  }
  const status = notificacao.enviado ? 'email_enviado' : 'pendente_email';
  await submissionModel.atualizarStatus(envio.id, status);

  return {
    envio: { id: envio.id, status, destino: envio.destino, criadoEm: envio.criadoEm },
    cliente,
    orcamento,
    resumo: envio.resumo,
    emailEnviado: !!notificacao.enviado,
    mensagem: notificacao.enviado
      ? 'Projeto enviado para a Novari.'
      : 'Projeto registado na Novari. O envio automático de email ainda não está configurado.'
  };
}

async function listarEnvios(id) {
  await projectService.obterRegisto(id);
  return submissionModel.listarPorProjeto(id);
}

module.exports = { enviar, listarEnvios, gerarResumo, gerarEspecificacoes };
