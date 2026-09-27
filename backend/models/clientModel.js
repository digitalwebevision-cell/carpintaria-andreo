/* Acesso a dados: clientes. */
const { getDb } = require('../database');
const { novoId, agora, dataIso } = require('../utils/helpers');

const TABELA = 'clients';

function paraApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    email: row.email || null,
    telefone: row.telefone || null,
    observacoes: row.observacoes || null,
    criadoEm: dataIso(row.created_at),
    atualizadoEm: dataIso(row.updated_at)
  };
}

async function criar(dados, trx) {
  const data = agora();
  const row = {
    id: novoId(),
    nome: dados.nome,
    email: dados.email || null,
    telefone: dados.telefone || null,
    observacoes: dados.observacoes || null,
    created_at: data,
    updated_at: data
  };
  await (trx || getDb())(TABELA).insert(row);
  return paraApi(row);
}

async function obter(id, trx) {
  return paraApi(await (trx || getDb())(TABELA).where({ id }).first());
}

async function obterPorEmail(email, trx) {
  if (!email) return null;
  return paraApi(await (trx || getDb())(TABELA).where({ email: String(email).toLowerCase() }).first());
}

async function listar({ limit, offset, pesquisa }) {
  const base = getDb()(TABELA).modify((q) => {
    if (pesquisa) q.where((w) => w.whereLike('nome', `%${pesquisa}%`).orWhereLike('email', `%${pesquisa}%`));
  });
  const [{ total }] = await base.clone().count({ total: '*' });
  const rows = await base.clone().orderBy('created_at', 'desc').limit(limit).offset(offset);
  return { itens: rows.map(paraApi), total: Number(total) };
}

async function atualizar(id, campos, trx) {
  const alterar = { updated_at: agora() };
  ['nome', 'email', 'telefone', 'observacoes'].forEach((k) => {
    if (campos[k] !== undefined) alterar[k] = campos[k] === '' ? null : campos[k];
  });
  const n = await (trx || getDb())(TABELA).where({ id }).update(alterar);
  return n ? obter(id, trx) : null;
}

async function remover(id) {
  return (await getDb()(TABELA).where({ id }).del()) > 0;
}

module.exports = { criar, obter, obterPorEmail, listar, atualizar, remover };
