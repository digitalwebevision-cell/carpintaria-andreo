/* ============================================================
   Projetos: criar, obter, substituir, atualizar parcialmente,
   excluir e listar. O estado 3D é validado e normalizado com o
   mesmo motor do frontend antes de ser guardado; o orçamento
   estimado é sempre recalculado no servidor.
   ============================================================ */
const projectModel = require('../models/projectModel');
const clientModel = require('../models/clientModel');
const engine = require('./engine');
const quoteService = require('./quoteService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { z, validar } = require('../validators/common');
const { projetoSchema, metaSchema, META_CAMPOS } = require('../validators/projectSchema');
const { novoId, isUuid, mergePatch } = require('../utils/helpers');

const naoEncontrado = () => AppError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');

// Resposta: metadados + estado completo do projeto no mesmo objeto (formato do frontend)
function paraApi(p) {
  return {
    ...p.dados,
    id: p.id,
    nome: p.nome,
    clienteId: p.clienteId,
    orcamentoEstimado: p.orcamentoEstimado,
    enviadoEm: p.enviadoEm,
    criadoEm: p.criadoEm,
    atualizadoEm: p.atualizadoEm
  };
}

function separar(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new AppError(400, 'INVALID_BODY', 'O corpo do pedido deve ser um objeto JSON.');
  }
  const meta = validar(metaSchema, { nome: corpo.nome, clienteId: corpo.clienteId }, 'Dados do projeto inválidos.');
  const estado = { ...corpo };
  META_CAMPOS.forEach((k) => delete estado[k]);
  // compatibilidade: { projeto: {...} } também é aceite
  if (corpo.projeto && typeof corpo.projeto === 'object' && !corpo.tipo) Object.assign(estado, corpo.projeto);
  delete estado.projeto;
  return { meta, estado, temClienteId: Object.prototype.hasOwnProperty.call(corpo, 'clienteId') };
}

function prepararEstado(estado) {
  const valido = validar(projetoSchema, estado, 'Projeto inválido.');
  const normal = engine.normalizar(valido);
  if (normal.selecionado && !normal.modulos.some((m) => m.id === normal.selecionado)) normal.selecionado = null;
  return normal;
}

async function garantirCliente(clienteId) {
  if (!clienteId) return;
  if (!(await clientModel.obter(clienteId))) {
    throw new AppError(422, 'CLIENT_NOT_FOUND', 'O cliente indicado não existe.');
  }
}

const nomePadrao = (estado) => `${engine.Catalogo.AMBIENTES[estado.tipo] || 'Projeto'} Novari`;

async function obterRegisto(id) {
  if (!isUuid(id)) throw naoEncontrado();
  const p = await projectModel.obter(id);
  if (!p) throw naoEncontrado();
  return p;
}

async function criar(corpo) {
  const { meta, estado } = separar(corpo);
  const dados = prepararEstado(estado);
  await garantirCliente(meta.clienteId);
  const p = await projectModel.criar({
    id: novoId(),
    clienteId: meta.clienteId || null,
    nome: meta.nome || nomePadrao(dados),
    tipo: dados.tipo,
    estado: dados.estado,
    orcamentoEstimado: quoteService.estimarProjeto(dados).valorAproximado,
    dados
  });
  logger.info('Projeto criado', { projetoId: p.id, tipo: p.tipo, modulos: dados.modulos.length });
  return paraApi(p);
}

async function obter(id) {
  return paraApi(await obterRegisto(id));
}

async function gravar(atual, meta, dados, temClienteId) {
  if (temClienteId) await garantirCliente(meta.clienteId);
  const p = await projectModel.atualizar(atual.id, {
    ...(meta.nome ? { nome: meta.nome } : {}),
    ...(temClienteId ? { clienteId: meta.clienteId || null } : {}),
    tipo: dados.tipo,
    estado: dados.estado,
    orcamentoEstimado: quoteService.estimarProjeto(dados).valorAproximado,
    dados
  });
  if (!p) throw naoEncontrado();
  return paraApi(p);
}

// PUT: substitui o estado completo do projeto
async function substituir(id, corpo) {
  const atual = await obterRegisto(id);
  const { meta, estado, temClienteId } = separar(corpo);
  const dados = prepararEstado(estado);
  const p = await gravar(atual, meta, dados, temClienteId);
  logger.info('Projeto substituído', { projetoId: id, modulos: dados.modulos.length });
  return p;
}

// PATCH: JSON Merge Patch (RFC 7386) sobre o estado atual
async function atualizarParcial(id, corpo) {
  const atual = await obterRegisto(id);
  const { meta, estado: patch, temClienteId } = separar(corpo);
  const dados = prepararEstado(mergePatch(atual.dados, patch));
  const p = await gravar(atual, meta, dados, temClienteId);
  logger.info('Projeto atualizado', { projetoId: id, campos: Object.keys(corpo) });
  return p;
}

async function remover(id) {
  if (!isUuid(id) || !(await projectModel.remover(id))) throw naoEncontrado();
  logger.info('Projeto excluído', { projetoId: id });
}

const filtrosLista = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  clienteId: z.string().uuid('clienteId deve ser um UUID.').optional(),
  tipo: z.string().max(40).optional(),
  estado: z.string().max(40).optional()
});

async function listar(query) {
  const filtros = validar(filtrosLista, query, 'Filtros inválidos.');
  const { itens, total } = await projectModel.listar(filtros);
  return { itens, meta: { total, limit: filtros.limit, offset: filtros.offset } };
}

async function orcamento(id) {
  const p = await obterRegisto(id);
  return { projetoId: p.id, ...quoteService.estimarProjeto(p.dados) };
}

module.exports = { criar, obter, obterRegisto, substituir, atualizarParcial, remover, listar, orcamento, paraApi };
