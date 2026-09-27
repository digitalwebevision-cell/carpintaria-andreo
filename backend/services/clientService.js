/* Clientes. Um cliente pode ter vários projetos (projects.client_id). */
const clientModel = require('../models/clientModel');
const projectModel = require('../models/projectModel');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { z, validar } = require('../validators/common');
const { clienteSchema, clienteParcialSchema } = require('../validators/clientSchema');
const { isUuid } = require('../utils/helpers');

// Campos vazios ("") vindos de formulários passam a null
const semVazios = (obj) =>
  obj && typeof obj === 'object' && !Array.isArray(obj)
    ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' && !v.trim() ? null : v]))
    : obj;

const naoEncontrado = () => AppError.notFound('CLIENT_NOT_FOUND', 'Cliente não encontrado.');
const emailEmUso = () => new AppError(409, 'CLIENT_EMAIL_IN_USE', 'Já existe um cliente com este email.');

async function obterRegisto(id) {
  if (!isUuid(id)) throw naoEncontrado();
  const c = await clientModel.obter(id);
  if (!c) throw naoEncontrado();
  return c;
}

async function criar(corpo) {
  const dados = validar(clienteSchema, semVazios(corpo), 'Dados do cliente inválidos.');
  if (dados.email && (await clientModel.obterPorEmail(dados.email))) throw emailEmUso();
  const c = await clientModel.criar(dados);
  logger.info('Cliente criado', { clienteId: c.id });
  return c;
}

async function obter(id) {
  const c = await obterRegisto(id);
  const { itens } = await projectModel.listar({ clienteId: id, limit: 100, offset: 0 });
  return { ...c, projetos: itens };
}

const filtrosLista = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(100).optional()
});

async function listar(query) {
  const f = validar(filtrosLista, query, 'Filtros inválidos.');
  const { itens, total } = await clientModel.listar({ limit: f.limit, offset: f.offset, pesquisa: f.q });
  return { itens, meta: { total, limit: f.limit, offset: f.offset } };
}

async function atualizar(id, corpo) {
  await obterRegisto(id);
  const dados = validar(clienteParcialSchema, semVazios(corpo), 'Dados do cliente inválidos.');
  if (dados.email) {
    const outro = await clientModel.obterPorEmail(dados.email);
    if (outro && outro.id !== id) throw emailEmUso();
  }
  const c = await clientModel.atualizar(id, dados);
  logger.info('Cliente atualizado', { clienteId: id });
  return c;
}

// Os projetos do cliente não são apagados: ficam sem cliente associado
async function remover(id) {
  if (!isUuid(id) || !(await clientModel.remover(id))) throw naoEncontrado();
  logger.info('Cliente excluído', { clienteId: id });
}

async function listarProjetos(id, query) {
  await obterRegisto(id);
  const f = validar(filtrosLista.omit({ q: true }), query, 'Filtros inválidos.');
  const { itens, total } = await projectModel.listar({ clienteId: id, limit: f.limit, offset: f.offset });
  return { itens, meta: { total, limit: f.limit, offset: f.offset } };
}

/**
 * Encontra o cliente pelo email (sem duplicar) ou cria um novo.
 * Campos novos (telefone, nome) completam o registo existente.
 */
async function encontrarOuCriar(dadosBrutos, trx) {
  const dados = validar(clienteSchema, semVazios(dadosBrutos), 'Dados do cliente inválidos.');
  const existente = dados.email ? await clientModel.obterPorEmail(dados.email, trx) : null;
  if (!existente) return clientModel.criar(dados, trx);
  const completar = {};
  if (dados.telefone && dados.telefone !== existente.telefone) completar.telefone = dados.telefone;
  if (dados.nome && dados.nome !== existente.nome) completar.nome = dados.nome;
  return Object.keys(completar).length ? clientModel.atualizar(existente.id, completar, trx) : existente;
}

module.exports = { criar, obter, listar, atualizar, remover, listarProjetos, encontrarOuCriar };
