/* Acesso a dados: projetos. O estado 3D completo fica na coluna "dados" (JSON). */
const { getDb } = require('../database');
const { agora, dataIso, lerJson } = require('../utils/helpers');

const TABELA = 'projects';

function deLinha(row) {
  if (!row) return null;
  return {
    id: row.id,
    clienteId: row.client_id || null,
    nome: row.nome,
    tipo: row.tipo,
    estado: row.estado,
    orcamentoEstimado: Number(row.orcamento_estimado) || 0,
    enviadoEm: dataIso(row.enviado_em),
    criadoEm: dataIso(row.created_at),
    atualizadoEm: dataIso(row.updated_at),
    dados: lerJson(row.dados, {})
  };
}

function paraLinha(p) {
  const row = {};
  if (p.id !== undefined) row.id = p.id;
  if (p.clienteId !== undefined) row.client_id = p.clienteId;
  if (p.nome !== undefined) row.nome = p.nome;
  if (p.tipo !== undefined) row.tipo = p.tipo;
  if (p.estado !== undefined) row.estado = p.estado;
  if (p.orcamentoEstimado !== undefined) row.orcamento_estimado = p.orcamentoEstimado;
  if (p.dados !== undefined) row.dados = JSON.stringify(p.dados);
  if (p.enviadoEm !== undefined) row.enviado_em = p.enviadoEm;
  return row;
}

async function criar(projeto, trx) {
  const data = agora();
  const row = { ...paraLinha(projeto), created_at: data, updated_at: data };
  await (trx || getDb())(TABELA).insert(row);
  return obter(projeto.id, trx);
}

async function obter(id, trx) {
  return deLinha(await (trx || getDb())(TABELA).where({ id }).first());
}

// Listagem leve: não devolve o estado 3D completo
async function listar({ limit, offset, clienteId, tipo, estado }) {
  const base = getDb()(TABELA).modify((q) => {
    if (clienteId) q.where('client_id', clienteId);
    if (tipo) q.where('tipo', tipo);
    if (estado) q.where('estado', estado);
  });
  const [{ total }] = await base.clone().count({ total: '*' });
  const rows = await base
    .clone()
    .select('id', 'client_id', 'nome', 'tipo', 'estado', 'orcamento_estimado', 'enviado_em', 'created_at', 'updated_at')
    .orderBy('updated_at', 'desc')
    .limit(limit)
    .offset(offset);
  return {
    itens: rows.map((r) => {
      const p = deLinha({ ...r, dados: null });
      delete p.dados;
      return p;
    }),
    total: Number(total)
  };
}

async function atualizar(id, campos, trx) {
  const n = await (trx || getDb())(TABELA)
    .where({ id })
    .update({ ...paraLinha(campos), updated_at: agora() });
  return n ? obter(id, trx) : null;
}

async function remover(id) {
  return (await getDb()(TABELA).where({ id }).del()) > 0;
}

module.exports = { criar, obter, listar, atualizar, remover };
