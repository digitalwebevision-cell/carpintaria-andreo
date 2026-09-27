/* Acesso a dados: envios de projetos para a Novari (histórico de pedidos). */
const { getDb } = require('../database');
const { novoId, agora, dataIso, lerJson } = require('../utils/helpers');

const TABELA = 'project_submissions';
const TABELA_VISTAS = 'submission_views';

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
    id: envio.id || novoId(),
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

async function obter(id) {
  return paraApi(await getDb()(TABELA).where({ id }).first());
}

// Vistas 3D (imagens) do envio — planificação para o marceneiro
async function guardarVistas(submissionId, vistas, trx) {
  if (!vistas.length) return;
  const criadoEm = agora();
  await (trx || getDb())(TABELA_VISTAS).insert(
    vistas.map((v, ordem) => ({
      id: novoId(),
      submission_id: submissionId,
      ordem,
      nome: v.nome,
      titulo: v.titulo,
      mime: v.mime,
      dados: v.dados,
      created_at: criadoEm
    }))
  );
}

async function listarVistas(submissionId) {
  const rows = await getDb()(TABELA_VISTAS)
    .select('ordem', 'nome', 'titulo', 'mime')
    .where({ submission_id: submissionId })
    .orderBy('ordem');
  return rows.map((r) => ({ ordem: Number(r.ordem), nome: r.nome, titulo: r.titulo, mime: r.mime }));
}

async function obterVista(submissionId, ordem) {
  const row = await getDb()(TABELA_VISTAS).select('mime', 'dados').where({ submission_id: submissionId, ordem }).first();
  return row ? { mime: row.mime, dados: Buffer.from(row.dados) } : null;
}

async function listarPorProjeto(projetoId) {
  const rows = await getDb()(TABELA).where({ project_id: projetoId }).orderBy('created_at', 'desc');
  return rows.map(paraApi);
}

module.exports = { criar, obter, atualizarStatus, listarPorProjeto, guardarVistas, listarVistas, obterVista };
