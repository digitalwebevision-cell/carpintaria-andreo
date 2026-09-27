/* ============================================================
   POST /api/projects/:id/send — enviar o projeto à Novari.
   1. valida o projeto e os contactos do cliente
   2. associa (ou cria, sem duplicar) o cliente
   3. gera resumo em texto + especificações técnicas + valor aproximado
   4. regista o envio no banco, com as vistas 3D (planificação) capturadas
      no planejador
   5. notifica a Novari (email, quando configurado) com o link da ficha
      do marceneiro: medidas + vistas 3D + 3D interativo
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
const { linksEnvio } = require('./fichaService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { z, validar } = require('../validators/common');
const { agora, novoId } = require('../utils/helpers');

const C = engine.Catalogo;

const TITULOS_VISTA = {
  perspetiva: 'Perspetiva',
  planta: 'Planta (vista de cima)',
  frontal: 'Vista frontal',
  lateral: 'Vista lateral'
};
const TAMANHO_MAX_VISTA = 2.5 * 1024 * 1024; // por imagem, já descodificada
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

const vistaSchema = z
  .object({
    nome: z.enum(Object.keys(TITULOS_VISTA)),
    titulo: z.string().max(80).optional(),
    imagem: z.string().max(Math.ceil((TAMANHO_MAX_VISTA * 4) / 3) + 40)
  })
  .strict();

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
    observacoes: z.string().max(5000).optional(),
    vistas: z.array(vistaSchema).max(Object.keys(TITULOS_VISTA).length).optional()
  })
  .strict();

// Confere que cada imagem é mesmo JPEG/PNG/WebP (não só o que o data URL diz)
function assinaturaValida(mime, buf) {
  if (mime === 'image/jpeg') return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
}

function lerVistas(vistas) {
  return (vistas || []).map((v, i) => {
    const m = DATA_URL_RE.exec(v.imagem);
    const dados = m ? Buffer.from(m[2], 'base64') : null;
    if (!m || !dados.length || dados.length > TAMANHO_MAX_VISTA || !assinaturaValida(m[1], dados)) {
      throw AppError.validation([{ campo: `vistas.${i}.imagem`, mensagem: 'Imagem inválida (JPEG, PNG ou WebP até 2,5 MB).' }], 'Vista 3D inválida.');
    }
    return { nome: v.nome, titulo: TITULOS_VISTA[v.nome], mime: m[1], dados };
  });
}

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

function gerarResumo({ projeto, cliente, orcamento, observacoes, links, totalVistas }) {
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
    ...(links
      ? [
          'PLANIFICAÇÃO 3D E MEDIDAS (para o marceneiro)',
          `Ficha técnica${totalVistas ? ` com ${totalVistas} vistas 3D` : ''}: ${links.ficha}`,
          `Ver e rodar o projeto em 3D: ${links.visualizacao3d}`,
          ''
        ]
      : []),
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

  const vistas = lerVistas(pedido.vistas);
  const orcamento = quoteService.estimarProjeto(projeto.dados);

  const { envio, cliente } = await getDb().transaction(async (trx) => {
    const cli = pedido.cliente ? await clientService.encontrarOuCriar(pedido.cliente, trx) : await clientModel.obter(projeto.clienteId, trx);
    if (!cli) throw new AppError(422, 'CLIENT_NOT_FOUND', 'O cliente associado ao projeto não existe.');
    const enviadoEm = agora();
    await projectModel.atualizar(projeto.id, { clienteId: cli.id, enviadoEm, orcamentoEstimado: orcamento.valorAproximado }, trx);
    const envioId = novoId();
    const links = linksEnvio(envioId, projeto.id);
    const resumo = gerarResumo({ projeto, cliente: cli, orcamento, observacoes: pedido.observacoes, links, totalVistas: vistas.length });
    const registo = await submissionModel.criar(
      {
        id: envioId,
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
    await submissionModel.guardarVistas(registo.id, vistas, trx);
    return { envio: registo, cliente: cli };
  });

  logger.info('Projeto enviado para a Novari', { projetoId: projeto.id, envioId: envio.id, modulos: projeto.dados.modulos.length, vistas: vistas.length });
  const links = linksEnvio(envio.id, projeto.id);

  let notificacao;
  try {
    notificacao = await notificationService.notificarNovoProjeto({ envio, cliente, vistas });
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
    links,
    vistas: vistas.length,
    emailEnviado: !!notificacao.enviado,
    mensagem: notificacao.enviado
      ? 'Projeto enviado para a Novari.'
      : notificacao.motivo === 'ERRO_NO_ENVIO'
        ? 'Projeto registado na Novari, mas o email não pôde ser enviado.'
        : 'Projeto registado na Novari. O envio automático de email ainda não está configurado.'
  };
}

async function listarEnvios(id) {
  await projectService.obterRegisto(id);
  return submissionModel.listarPorProjeto(id);
}

module.exports = { enviar, listarEnvios, gerarResumo, gerarEspecificacoes };
