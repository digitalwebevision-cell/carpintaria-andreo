/* Testes de ponta a ponta da API (node:test, sem dependências extra).
   Usam um banco SQLite temporário e a app numa porta aleatória. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'novari-test-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `sqlite:${path.join(pasta, 'teste.sqlite')}`;
process.env.AI_API_KEY = '';

const { criarApp } = require('../app');
const { migrar, fechar } = require('../database');
const engine = require('../services/engine');
const { validarComandos } = require('../validators/actionValidator');

let base;
let servidor;

async function api(metodo, caminho, corpo, cabecalhos = {}) {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...cabecalhos },
    body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
  });
  const texto = await r.text();
  return { status: r.status, headers: r.headers, body: texto ? JSON.parse(texto) : null, texto };
}

// Projeto real gerado pelo mesmo motor do planejador (cozinha padrão)
function projetoDoPlanejador() {
  return JSON.parse(JSON.stringify(engine.Projeto.obter()));
}

before(async () => {
  await migrar();
  servidor = criarApp().listen(0);
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((r) => servidor.close(r));
  await fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('1-2. health check', async () => {
  const r = await api('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.equal(r.body.message, 'Novari API funcionando.');
});

test('3-7. ciclo de vida do projeto: criar, consultar, atualizar, excluir', async () => {
  const estado = projetoDoPlanejador();
  const criado = await api('POST', '/api/projects', { nome: 'Cozinha da Maria', ...estado, orcamentoEstimado: 1 });
  assert.equal(criado.status, 201, criado.texto);
  const p = criado.body.data;
  assert.match(p.id, /^[0-9a-f-]{36}$/);
  assert.equal(p.nome, 'Cozinha da Maria');
  assert.equal(p.modulos.length, estado.modulos.length);
  // o orçamento é sempre calculado no servidor (o valor 1 enviado é ignorado)
  assert.equal(p.orcamentoEstimado, Math.round(engine.calcularOrcamento(estado).total * 100) / 100);
  assert.equal(criado.headers.get('location'), `/api/projects/${p.id}`);

  const lido = await api('GET', `/api/projects/${p.id}`);
  assert.equal(lido.status, 200);
  assert.deepEqual(lido.body.data.espaco, estado.espaco);
  assert.equal(lido.body.data.modulos[0].id, estado.modulos[0].id);

  // PUT: substitui o estado inteiro
  const novo = { ...lido.body.data, espaco: { largura: 400, profundidade: 260, altura: 270 }, acabamento: 'Nogueira' };
  const put = await api('PUT', `/api/projects/${p.id}`, novo);
  assert.equal(put.status, 200, put.texto);
  assert.equal(put.body.data.acabamento, 'Nogueira');
  assert.equal(put.body.data.paredes[0].comprimento, 400);

  // PATCH: merge parcial
  const patch = await api('PATCH', `/api/projects/${p.id}`, { observacoes: 'Quero puxadores pretos.', preferencias: { ilha: true } });
  assert.equal(patch.status, 200, patch.texto);
  assert.equal(patch.body.data.observacoes, 'Quero puxadores pretos.');
  assert.equal(patch.body.data.preferencias.ilha, true);
  assert.equal(patch.body.data.preferencias.formato, 'linear', 'o resto das preferências mantém-se');

  const relido = await api('GET', `/api/projects/${p.id}`);
  assert.equal(relido.body.data.acabamento, 'Nogueira');
  assert.equal(relido.body.data.observacoes, 'Quero puxadores pretos.');
  assert.ok(relido.body.data.atualizadoEm >= relido.body.data.criadoEm);

  const lista = await api('GET', '/api/projects?limit=5');
  assert.equal(lista.status, 200);
  assert.ok(lista.body.data.some((x) => x.id === p.id));
  assert.equal(lista.body.data[0].modulos, undefined, 'a listagem não traz o estado 3D completo');

  const apagado = await api('DELETE', `/api/projects/${p.id}`);
  assert.equal(apagado.status, 204);
  const depois = await api('GET', `/api/projects/${p.id}`);
  assert.equal(depois.status, 404);
  assert.deepEqual(depois.body, { success: false, error: { code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' } });
});

test('validação: rejeita projetos que partiriam o planejador', async () => {
  const estado = projetoDoPlanejador();
  const casos = [
    { ...estado, tipo: 'garagem' },
    { ...estado, espaco: { largura: -5, profundidade: 240, altura: 270 } },
    { ...estado, espaco: { largura: 'grande', profundidade: 240, altura: 270 } },
    { ...estado, modulos: [{ ...estado.modulos[0], catalogoId: 'nao-existe' }] },
    { ...estado, modulos: [estado.modulos[0], estado.modulos[0]] },
    { ...estado, modulos: [{ ...estado.modulos[0], posicao: { x: 5000, y: 0, z: 0 } }] }
  ];
  for (const c of casos) {
    const r = await api('POST', '/api/projects', c);
    assert.equal(r.status, 422, JSON.stringify(r.body));
    assert.equal(r.body.error.code, 'VALIDATION_ERROR');
    assert.ok(r.body.error.details.length > 0);
  }
  const json = await api('POST', '/api/projects', '{ isto não é json');
  assert.equal(json.status, 400);
  assert.equal(json.body.error.code, 'INVALID_JSON');
  assert.equal((await api('GET', '/api/projects/123')).status, 404);
  assert.equal((await api('GET', '/api/nada')).body.error.code, 'ROUTE_NOT_FOUND');
});

test('8-9. clientes e associação a projetos', async () => {
  const c = await api('POST', '/api/clients', { nome: 'Maria Silva', email: 'Maria@Exemplo.com', telefone: '(11) 98888-7777', observacoes: '' });
  assert.equal(c.status, 201, c.texto);
  const cliente = c.body.data;
  assert.equal(cliente.email, 'maria@exemplo.com');

  const dup = await api('POST', '/api/clients', { nome: 'Outra Maria', email: 'maria@exemplo.com' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'CLIENT_EMAIL_IN_USE');

  const invalido = await api('POST', '/api/clients', { nome: '', email: 'x' });
  assert.equal(invalido.status, 422);

  const p1 = await api('POST', '/api/projects', { ...projetoDoPlanejador(), clienteId: cliente.id });
  assert.equal(p1.status, 201, p1.texto);
  assert.equal(p1.body.data.clienteId, cliente.id);
  const p2 = await api('POST', '/api/projects', { ...projetoDoPlanejador(), nome: 'Roupeiro' });
  const assoc = await api('PATCH', `/api/projects/${p2.body.data.id}`, { clienteId: cliente.id });
  assert.equal(assoc.status, 200);
  assert.equal(assoc.body.data.clienteId, cliente.id);

  const semCliente = await api('PATCH', `/api/projects/${p2.body.data.id}`, { clienteId: '00000000-0000-4000-8000-000000000000' });
  assert.equal(semCliente.status, 422);
  assert.equal(semCliente.body.error.code, 'CLIENT_NOT_FOUND');

  const detalhe = await api('GET', `/api/clients/${cliente.id}`);
  assert.equal(detalhe.body.data.projetos.length, 2);
  const projetos = await api('GET', `/api/clients/${cliente.id}/projects`);
  assert.equal(projetos.body.meta.total, 2);
  const filtrados = await api('GET', `/api/projects?clienteId=${cliente.id}`);
  assert.equal(filtrados.body.meta.total, 2);

  // excluir o cliente não apaga os projetos
  assert.equal((await api('DELETE', `/api/clients/${cliente.id}`)).status, 204);
  const orfao = await api('GET', `/api/projects/${p1.body.data.id}`);
  assert.equal(orfao.status, 200);
  assert.equal(orfao.body.data.clienteId, null);
});

test('10. orçamento: projeto guardado, projeto avulso e lista de módulos', async () => {
  const estado = projetoDoPlanejador();
  const esperado = Math.round(engine.calcularOrcamento(estado).total * 100) / 100;

  const p = await api('POST', '/api/projects', estado);
  const q1 = await api('GET', `/api/projects/${p.body.data.id}/quote`);
  assert.equal(q1.status, 200);
  assert.equal(q1.body.data.valorAproximado, esperado);
  assert.match(q1.body.data.aviso, /Valor aproximado/);

  const q2 = await api('POST', '/api/quotes/project', estado);
  assert.equal(q2.body.data.valorAproximado, esperado);

  const q3 = await api('POST', '/api/quotes/estimate', {
    modulos: [{ catalogoId: 'inferior-60', quantidade: 2 }, { catalogoId: 'superior-80', componentes: { led: true } }],
    material: 'MDF',
    acabamento: 'Branco'
  });
  assert.equal(q3.status, 200, q3.texto);
  assert.equal(q3.body.data.modulos, 3);
  assert.ok(q3.body.data.valorAproximado > 0);
  assert.ok(q3.body.data.linhas.some((l) => l.rotulo === 'Iluminação'));

  const q4 = await api('POST', '/api/quotes/estimate', { modulos: [{ catalogoId: 'foguetao' }] });
  assert.equal(q4.status, 422);
});

test('envio do projeto para a Novari', async () => {
  const p = await api('POST', '/api/projects', projetoDoPlanejador());
  const id = p.body.data.id;

  const semContacto = await api('POST', `/api/projects/${id}/send`, {});
  assert.equal(semContacto.status, 422);
  assert.equal(semContacto.body.error.code, 'CLIENT_REQUIRED');

  const cliente = { nome: 'João', email: 'joao@exemplo.com', telefone: '' };
  const r = await api('POST', `/api/projects/${id}/send`, { cliente, observacoes: 'Ligar à tarde.' });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.body.data.envio.destino, 'novarimobiliarioexclusivo@gmail.com');
  assert.equal(r.body.data.emailEnviado, false);
  assert.match(r.body.data.resumo, /VALOR APROXIMADO \(não é orçamento final\)/);
  assert.match(r.body.data.resumo, /Ligar à tarde\./);

  // segundo envio com o mesmo email reutiliza o cliente
  const r2 = await api('POST', `/api/projects/${id}/send`, { cliente: { nome: 'João', email: 'JOAO@exemplo.com', telefone: '11 99999-0000' } });
  assert.equal(r2.body.data.cliente.id, r.body.data.cliente.id);
  assert.equal(r2.body.data.cliente.telefone, '11 99999-0000');

  const envios = await api('GET', `/api/projects/${id}/submissions`);
  assert.equal(envios.body.data.length, 2);
  const projeto = await api('GET', `/api/projects/${id}`);
  assert.ok(projeto.body.data.enviadoEm);
  assert.equal(projeto.body.data.clienteId, r.body.data.cliente.id);
});

test('envio leva a planificação 3D e a ficha do marceneiro', async () => {
  const p = await api('POST', '/api/projects', projetoDoPlanejador());
  const id = p.body.data.id;
  const cliente = { nome: 'Ana <b>', telefone: '11 98888-7777' };
  // PNG 1×1 válido
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const vistas = [
    { nome: 'perspetiva', titulo: 'Perspetiva', imagem: `data:image/png;base64,${png}` },
    { nome: 'planta', imagem: `data:image/png;base64,${png}` }
  ];

  // imagem que não é imagem → recusada
  const falsa = await api('POST', `/api/projects/${id}/send`, {
    cliente,
    vistas: [{ nome: 'planta', imagem: `data:image/png;base64,${Buffer.from('<script>').toString('base64')}` }]
  });
  assert.equal(falsa.status, 422);
  assert.equal(falsa.body.error.details[0].campo, 'vistas.0.imagem');

  const r = await api('POST', `/api/projects/${id}/send`, { cliente, vistas });
  assert.equal(r.status, 201, r.texto);
  const envio = r.body.data;
  assert.equal(envio.vistas, 2);
  assert.match(envio.links.ficha, new RegExp(`/api/submissions/${envio.envio.id}/ficha$`));
  assert.match(envio.links.visualizacao3d, new RegExp(`configurador\\.html\\?projeto=${id}&modo=leitura$`));
  assert.match(envio.resumo, /PLANIFICAÇÃO 3D E MEDIDAS/);
  assert.ok(envio.resumo.includes(envio.links.ficha));

  const ficha = await fetch(`${base}/api/submissions/${envio.envio.id}/ficha`);
  assert.equal(ficha.status, 200);
  assert.match(ficha.headers.get('content-type'), /text\/html/);
  assert.match(ficha.headers.get('content-security-policy'), /default-src 'none'/);
  const html = await ficha.text();
  const modulo = p.body.data.modulos[0];
  assert.ok(html.includes(modulo.nome));
  assert.ok(html.includes(`<td class="n">${modulo.dimensoes.largura}</td>`));
  assert.ok(html.includes('src="vistas/1"'));
  assert.ok(html.includes('Ana &lt;b&gt;'));
  assert.ok(!html.includes('Ana <b>'));

  const img = await fetch(`${base}/api/submissions/${envio.envio.id}/vistas/0`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), Buffer.from(png, 'base64'));

  assert.equal((await fetch(`${base}/api/submissions/${envio.envio.id}/vistas/9`)).status, 404);
  assert.equal((await fetch(`${base}/api/submissions/nao-existe/ficha`)).status, 404);
});

test('IA: sem chave responde 503 e valida o pedido', async () => {
  const semMensagem = await api('POST', '/api/ai', { project: projetoDoPlanejador() });
  assert.equal(semMensagem.status, 422);
  const r = await api('POST', '/api/ai', { message: 'Coloque mais duas gavetas', project: projetoDoPlanejador() });
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, 'AI_NOT_CONFIGURED');
  assert.equal((await api('GET', '/api/ai/status')).body.data.configurada, false);
});

test('IA: comandos estruturados são validados antes de chegar ao 3D', async () => {
  const p = projetoDoPlanejador();
  const inferior = p.modulos.find((m) => m.tipo === 'inferior');
  const acoes = [
    { type: 'add_drawer', moduleId: inferior.id, quantity: 1 }, // formato em inglês → aceite
    { action: 'add_drawer', id: 'modulo-999', quantidade: 2 }, // módulo inexistente
    { action: 'resize_module', id: inferior.id, largura: 500 }, // mm → 50 cm, dentro dos limites
    { action: 'resize_module', id: inferior.id, largura: 300 }, // acima do máximo do módulo
    { action: 'set_room_dimensions', largura: 5000 }, // 500 cm (mm) → ok
    { action: 'set_room_dimensions', largura: 50 }, // abaixo do mínimo
    { action: 'change_finish', acabamento: 'Ouro' },
    { action: 'formatar_disco' },
    { action: 'add_drawer', id: inferior.id, quantidade: 'muitas' },
    { action: 'move_module', id: inferior.id, x: 99999 },
    { action: 'rotate_module', id: inferior.id, graus: 90 } // encostado à parede → o motor recusa
  ];
  const r = validarComandos(acoes, p);
  assert.deepEqual(
    r.aceites.map((a) => a.action),
    ['add_drawer', 'resize_module', 'set_room_dimensions']
  );
  assert.deepEqual(r.aceites[0], { action: 'add_drawer', id: inferior.id, quantidade: 1 });
  assert.deepEqual(
    r.rejeitados.map((x) => x.indice),
    [1, 3, 5, 6, 7, 8, 9, 10]
  );
  assert.match(r.rejeitados.find((x) => x.indice === 10).motivo, /parede/);

  const http = await api('POST', '/api/ai/validate', { project: p, actions: acoes });
  assert.equal(http.status, 200);
  assert.equal(http.body.data.valid, false);
  assert.equal(http.body.data.actions.length, 3);
});

test('segurança: CORS e ficheiros do backend não são servidos', async () => {
  const permitido = await api('GET', '/api/health', undefined, { Origin: 'http://localhost:5500' });
  assert.equal(permitido.headers.get('access-control-allow-origin'), 'http://localhost:5500');
  const bloqueado = await api('GET', '/api/health', undefined, { Origin: 'https://site-malicioso.example' });
  assert.equal(bloqueado.headers.get('access-control-allow-origin'), null);

  for (const caminho of ['/backend/.env.example', '/backend/package.json', '/%62ackend/package.json', '/x/../backend/app.js', '/.git/config', '/ai_agent.py']) {
    const r = await fetch(base + caminho);
    assert.equal(r.status, 404, caminho);
  }
  const site = await fetch(base + '/configurador.html');
  assert.equal(site.status, 200);
});

test('IA: pedido à API e tratamento da resposta (cliente simulado)', async () => {
  const config = require('../config');
  const aiService = require('../services/aiService');
  const p = projetoDoPlanejador();
  const inferior = p.modulos.find((m) => m.tipo === 'inferior');
  let pedido = null;
  aiService._definirClienteParaTestes({
    beta: {
      messages: {
        create: async (req) => {
          pedido = req;
          return {
            model: req.model,
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 10 },
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: 'Adicionei duas gavetas ao módulo inferior.',
                  actions: [
                    { action: 'add_drawer', id: inferior.id, quantidade: 2 },
                    { action: 'remove_module', id: 'modulo-inexistente' }
                  ],
                  options: ['Ver valor', 'Mais gavetas'],
                  completed: false
                })
              }
            ]
          };
        }
      }
    }
  });
  config.ai.apiKey = 'chave-de-teste';
  try {
    const r = await api('POST', '/api/ai', { mensagem: 'Coloque mais duas gavetas', projeto: p, historico: [{ autor: 'cliente', texto: 'Olá' }] });
    assert.equal(r.status, 200, r.texto);
    assert.deepEqual(r.body.data.actions, [{ action: 'add_drawer', id: inferior.id, quantidade: 2 }]);
    assert.equal(r.body.data.rejected.length, 1);
    assert.match(r.body.data.message, /Não foi possível aplicar/);
    assert.deepEqual(r.body.data.options, ['Ver valor', 'Mais gavetas']);

    assert.equal(pedido.model, config.ai.model);
    assert.equal(pedido.output_config.format.type, 'json_schema');
    assert.equal(pedido.system[0].cache_control.type, 'ephemeral');
    assert.match(pedido.messages[0].content, /<mensagem_cliente>\nColoque mais duas gavetas\n<\/mensagem_cliente>/);
    assert.ok(!JSON.stringify(pedido).includes('chave-de-teste'), 'a chave nunca vai no corpo do pedido');
  } finally {
    config.ai.apiKey = '';
    aiService._definirClienteParaTestes(null);
  }
});
