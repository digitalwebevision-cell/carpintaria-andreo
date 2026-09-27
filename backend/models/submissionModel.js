/* Acesso a dados: envios de projetos para a Novari (histórico de pedidos). */
const { getDb } = require('../database');
const { novoId, agora, dataIso, lerJson } = require('../utils/helpers');

const TABELA = 'project_submissions';

function paraApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    projetoId: row.project_id,
    clienteId: row.client_id || null,
    destino: row.destino,
    status: row.status,
    resumo: row.resumo,
    especificacoes: lerJson(row.especificacoes, {}),
    orcamentoEstimado: Number(row.orcamento_estimado) || 0,
    criadoEm: dataIso(row.created_at)
  };
}

async function criar(envio, trx) {
  const row = {
    id: novoId(),
    project_id: envio.projetoId,
    client_id: envio.clienteId || null,
    destino: envio.destino,
    status: envio.status,
    resumo: envio.resumo,
    especificacoes: JSON.stringify(envio.especificacoes),
    orcamento_estimado: envio.orcamentoEstimado,
    created_at: agora()
  };
  await (trx || getDb())(TABELA).insert(row);
  return paraApi(row);
}

async function atualizarStatus(id, status) {
  await getDb()(TABELA).where({ id }).update({ status });
}

async function listarPorProjeto(projetoId) {
  const rows = await getDb()(TABELA).where({ project_id: projetoId }).orderBy('created_at', 'desc');
  return rows.map(paraApi);
}

module.exports = { criar, atualizarStatus, listarPorProjeto };
