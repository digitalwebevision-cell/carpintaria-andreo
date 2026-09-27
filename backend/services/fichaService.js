/* ============================================================
   Ficha técnica para o marceneiro (GET /api/submissions/:id/ficha).
   Página HTML com o que foi enviado: medidas do espaço e de cada
   módulo, pontos de água/gás/eletricidade e a planificação 3D
   (vistas capturadas no planejador), mais o link para o 3D interativo.
   Usa sempre o retrato guardado no envio, não o projeto atual.
   ============================================================ */
const submissionModel = require('../models/submissionModel');
const clientModel = require('../models/clientModel');
const { linksEnvio } = require('./submissionService');
const engine = require('./engine');
const AppError = require('../utils/AppError');
const { isUuid } = require('../utils/helpers');

const C = engine.Catalogo;

const NOMES_PAREDE = { fundo: 'Fundo', esquerda: 'Esquerda', direita: 'Direita', frente: 'Frente' };
const NOMES_PONTO = { agua: 'Água', gas: 'Gás', eletrica: 'Elétrica' };

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const parede = (id) => NOMES_PAREDE[id] || id || '—';
const cm = (v) => (v === undefined || v === null || v === '' ? '—' : `${escapar(v)} cm`);

async function obterEnvio(id) {
  const envio = isUuid(id) ? await submissionModel.obter(id) : null;
  if (!envio) throw AppError.notFound('SUBMISSION_NOT_FOUND', 'Envio não encontrado.');
  return envio;
}

async function obterVista(id, ordem) {
  const n = Number(ordem);
  const vista = isUuid(id) && Number.isInteger(n) && n >= 0 ? await submissionModel.obterVista(id, n) : null;
  if (!vista) throw AppError.notFound('VIEW_NOT_FOUND', 'Vista não encontrada.');
  return vista;
}

function tabelaModulos(modulos) {
  const linhas = modulos
    .map((m, i) => {
      const d = m.dimensoes || {};
      const c = m.componentes || {};
      const pos = m.posicao || {};
      const comp = [
        c.portas ? `${c.portas} porta(s)` : '',
        c.gavetas ? `${c.gavetas} gaveta(s)` : '',
        c.prateleiras ? `${c.prateleiras} prateleira(s)` : ''
      ]
        .filter(Boolean)
        .join(', ');
      return `<tr>
        <td>${i + 1}</td>
        <td>${escapar(m.nome)}</td>
        <td>${escapar(parede(m.parede))}</td>
        <td class="n">${escapar(d.largura)}</td>
        <td class="n">${escapar(d.altura)}</td>
        <td class="n">${escapar(d.profundidade)}</td>
        <td class="n">${escapar(pos.x)} / ${escapar(pos.y ?? 0)} / ${escapar(pos.z)}</td>
        <td class="n">${escapar(m.rotacao || 0)}°</td>
        <td>${escapar(comp) || '—'}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead><tr><th>#</th><th>Módulo</th><th>Parede</th><th>Largura</th><th>Altura</th><th>Prof.</th><th>Posição x / y / z</th><th>Rotação</th><th>Componentes</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="9">Nenhum módulo.</td></tr>'}</tbody>
  </table>
  <p class="nota">Medidas em cm. Posição do módulo em relação ao centro do espaço (x: esquerda → direita, z: frente → fundo, y: altura do chão).</p>`;
}

function listaPontos(esp) {
  const itens = [];
  Object.entries(esp.pontos || {}).forEach(([tipo, pontos]) => {
    (pontos || []).forEach((p) => {
      itens.push(`<li><b>${escapar(NOMES_PONTO[tipo] || tipo)}</b> — parede ${escapar(parede(p.parede))}, a ${cm(p.posicao)} do canto, altura ${cm(p.altura)}</li>`);
    });
  });
  (esp.portas || []).forEach((p) => {
    itens.push(`<li><b>Porta</b> — parede ${escapar(parede(p.parede))}, centro a ${cm(p.posicao)}, ${cm(p.largura)} × ${cm(p.altura)}</li>`);
  });
  (esp.janelas || []).forEach((j) => {
    itens.push(`<li><b>Janela</b> — parede ${escapar(parede(j.parede))}, centro a ${cm(j.posicao)}, ${cm(j.largura)} × ${cm(j.altura)}, peitoril ${cm(j.peitoril)}</li>`);
  });
  return itens.length ? `<ul>${itens.join('')}</ul>` : '<p>Nenhum ponto indicado.</p>';
}

async function gerarFicha(id) {
  const envio = await obterEnvio(id);
  const [vistas, cliente] = await Promise.all([
    submissionModel.listarVistas(envio.id),
    envio.clienteId ? clientModel.obter(envio.clienteId) : null
  ]);
  const esp = envio.especificacoes || {};
  const espaco = esp.espaco || {};
  const links = linksEnvio(envio.id, envio.projetoId);
  const eletro = (esp.eletrodomesticos || []).map((e) => C.ELETRODOMESTICOS[e] || e).join(', ');

  const figuras = vistas.length
    ? vistas
        .map(
          (v) => `<figure>
        <a href="vistas/${v.ordem}" target="_blank"><img src="vistas/${v.ordem}" alt="${escapar(v.titulo)}" loading="lazy"></a>
        <figcaption>${escapar(v.titulo)}</figcaption>
      </figure>`
        )
        .join('')
    : '<p>Este envio não inclui imagens 3D. Use o link do 3D interativo abaixo.</p>';

  const data = new Date(envio.criadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Ficha do marceneiro — ${escapar(C.AMBIENTES[esp.ambiente] || esp.ambiente || 'Projeto')}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #2b2118; background: #faf7f2; margin: 0; padding: 24px 16px; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 28px 0 10px; border-bottom: 1px solid #e3d9cc; padding-bottom: 6px; }
  .sub { color: #7a6a58; margin: 0 0 16px; font-size: 14px; }
  .dados { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px 24px; font-size: 14px; }
  .dados div b { display: block; font-size: 12px; color: #7a6a58; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  .vistas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  @media (max-width: 700px) { .vistas { grid-template-columns: 1fr; } }
  figure { margin: 0; background: #fff; border: 1px solid #e3d9cc; border-radius: 8px; overflow: hidden; }
  figure img { width: 100%; display: block; }
  figcaption { padding: 8px 12px; font-size: 13px; font-weight: 600; }
  .tabela { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; background: #fff; }
  th, td { border: 1px solid #e3d9cc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1ebe2; }
  td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .nota { font-size: 12px; color: #7a6a58; }
  .botao { display: inline-block; background: #6b4a2b; color: #fff; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: 600; }
  pre { white-space: pre-wrap; font: inherit; font-size: 14px; }
  @media print { body { background: #fff; padding: 0; } .botao { display: none; } figure, tr { break-inside: avoid; } }
</style>
</head>
<body>
<main>
  <h1>Ficha técnica para o marceneiro</h1>
  <p class="sub">Envio ${escapar(envio.id)} · ${escapar(data)}</p>

  <section class="dados">
    <div><b>Cliente</b>${escapar(cliente ? cliente.nome : '—')}</div>
    <div><b>Contacto</b>${escapar([cliente && cliente.telefone, cliente && cliente.email].filter(Boolean).join(' · ') || '—')}</div>
    <div><b>Ambiente</b>${escapar(C.AMBIENTES[esp.ambiente] || esp.ambiente || '—')}</div>
    <div><b>Espaço (L × P × A)</b>${escapar(espaco.largura)} × ${escapar(espaco.profundidade)} × ${escapar(espaco.altura)} cm</div>
    <div><b>Material</b>${escapar((C.MATERIAIS[esp.material] || {}).nome || esp.material || '—')}</div>
    <div><b>Acabamento</b>${escapar(esp.acabamento || '—')}</div>
    <div><b>Estilo</b>${escapar((C.ESTILOS[esp.estilo] || {}).nome || esp.estilo || '—')}</div>
    <div><b>Eletrodomésticos</b>${escapar(eletro || '—')}</div>
  </section>

  <h2>Planificação 3D</h2>
  <div class="vistas">${figuras}</div>
  <p><a class="botao" href="${escapar(links.visualizacao3d)}" target="_blank" rel="noopener">Abrir o projeto em 3D (rodar e aproximar)</a></p>
  <p class="nota">O 3D interativo mostra a versão mais recente do projeto do cliente; as imagens acima são as do momento do envio.</p>

  <h2>Medidas dos módulos</h2>
  <div class="tabela">${tabelaModulos(esp.modulos || [])}</div>

  <h2>Pontos de água, gás e eletricidade · portas e janelas</h2>
  ${listaPontos(esp)}

  <h2>Resumo enviado</h2>
  <pre>${escapar(envio.resumo)}</pre>
</main>
</body>
</html>`;
}

module.exports = { gerarFicha, obterVista };
