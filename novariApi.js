/* ============================================================
   NOVARI — LIGAÇÃO AO BACKEND (opcional)
   Quando a API da Novari está disponível:
     - guarda e recupera projetos (GET/POST/PUT /api/projects)
     - guarda automaticamente as alterações (com debounce)
     - envia o projeto à Novari (POST /api/projects/:id/send), com as
       vistas 3D para a ficha do marceneiro
     - ?modo=leitura: abre um projeto enviado só para ver (sem gravar)
     - liga o assistente à IA do servidor (POST /api/ai)
   Quando não está (ex.: site estático), o planejador continua
   a funcionar exatamente como antes (localStorage + mailto).
   No site publicado, a API é window.NOVARI_API_URL (configurador.html);
   em localhost usa-se sempre a API local.
   ============================================================ */
(function (global) {
  'use strict';

  const CHAVE_ID = 'novari-project-id';
  const PARAM_URL = 'projeto';
  // ?modo=leitura → link enviado ao marceneiro: abre o projeto só para ver
  const MODO_LEITURA = (() => {
    try { return new URL(global.location.href).searchParams.get('modo') === 'leitura'; } catch (e) { return false; }
  })();
  const ATRASO_AUTOSAVE = 3000;

  let base = null;
  let iaConfigurada = false;
  let verificacao = null;
  let projetoId = null;
  let ignorarAlteracoes = false;

  const armazenamento = {
    ler() {
      try { return localStorage.getItem(CHAVE_ID); } catch (e) { return null; }
    },
    gravar(id) {
      try { localStorage.setItem(CHAVE_ID, id); } catch (e) { /* navegador sem storage */ }
    },
    apagar() {
      try { localStorage.removeItem(CHAVE_ID); } catch (e) { /* navegador sem storage */ }
    }
  };

  // Em localhost usa sempre a API local (nunca grava no banco de produção);
  // no site publicado usa NOVARI_API_URL.
  function candidatos() {
    const loc = global.location;
    if (loc.protocol === 'file:') return ['http://localhost:3000/api'];
    if (['localhost', '127.0.0.1'].includes(loc.hostname)) return ['/api', 'http://localhost:3000/api'];
    return global.NOVARI_API_URL ? [String(global.NOVARI_API_URL).replace(/\/$/, '')] : [];
  }

  function comTempoLimite(ms) {
    if (global.AbortSignal && AbortSignal.timeout) return AbortSignal.timeout(ms);
    return undefined;
  }

  // Verifica se a API responde. Um sucesso fica em cache; uma falha não, para
  // voltar a tentar mais tarde (no Render gratuito a API pode estar a "acordar").
  let emailConfigurado = false;
  function disponivel() {
    if (!verificacao) {
      verificacao = (async () => {
        for (const c of candidatos()) {
          try {
            const r = await fetch(c + '/health', { signal: comTempoLimite(/^https:/.test(c) ? 8000 : 2500) });
            const j = await r.json();
            if (j && j.success) {
              base = c;
              iaConfigurada = !!(j.data && j.data.ia && j.data.ia.configurada);
              emailConfigurado = !!(j.data && j.data.email && j.data.email.configurado);
              return true;
            }
          } catch (e) { /* tenta o próximo */ }
        }
        verificacao = null;
        return false;
      })();
    }
    return verificacao;
  }

  async function pedido(metodo, caminho, corpo, tempoLimite) {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: corpo === undefined ? {} : { 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: comTempoLimite(tempoLimite || 15000)
    });
    const json = await r.json().catch(() => null);
    if (!r.ok || !json || !json.success) {
      const erro = new Error((json && json.error && json.error.message) || 'Falha na comunicação com o servidor (' + r.status + ').');
      erro.status = r.status;
      erro.code = json && json.error ? json.error.code : null;
      throw erro;
    }
    return json.data;
  }

  // O ID fica no localStorage e no endereço (?projeto=…) para poder reabrir/partilhar
  function definirId(id) {
    projetoId = id;
    if (MODO_LEITURA) return; // não se apropria do projeto do cliente
    armazenamento.gravar(id);
    try {
      const url = new URL(global.location.href);
      if (url.searchParams.get(PARAM_URL) !== id) {
        url.searchParams.set(PARAM_URL, id);
        global.history.replaceState(null, '', url);
      }
    } catch (e) { /* URL não suportado */ }
  }

  function esquecerId() {
    projetoId = null;
    armazenamento.apagar();
  }

  function idGuardado() {
    try {
      const daUrl = new URL(global.location.href).searchParams.get(PARAM_URL);
      if (daUrl) return daUrl;
    } catch (e) { /* ignora */ }
    return MODO_LEITURA ? null : armazenamento.ler();
  }

  async function guardar(projeto) {
    if (MODO_LEITURA) throw new Error('Projeto aberto só para visualização.');
    if (!(await disponivel())) throw new Error('Servidor indisponível.');
    const corpo = JSON.parse(JSON.stringify(projeto));
    let r = null;
    if (projetoId) {
      try {
        r = await pedido('PUT', '/projects/' + projetoId, corpo);
      } catch (e) {
        if (e.status !== 404) throw e;
        esquecerId(); // foi apagado no servidor → cria um novo
      }
    }
    if (!r) r = await pedido('POST', '/projects', corpo);
    definirId(r.id);
    return r;
  }

  async function recuperar(Store) {
    const id = idGuardado();
    if (!id || !(await disponivel())) return null;
    try {
      const p = await pedido('GET', '/projects/' + encodeURIComponent(id));
      ignorarAlteracoes = true;
      try { Store.carregar(p); } finally { ignorarAlteracoes = false; }
      definirId(p.id);
      return p;
    } catch (e) {
      if (e.status === 404) esquecerId();
      console.warn('[Novari] não foi possível recuperar o projeto guardado:', e.message);
      return null;
    }
  }

  // Guarda automaticamente só depois de o projeto existir no servidor,
  // agrupando alterações seguidas (não envia um pedido por cada movimento).
  function ativarAutosave(Store) {
    let temporizador = null;
    let emCurso = false;
    let pendente = false;

    async function executar() {
      temporizador = null;
      if (emCurso) { pendente = true; return; }
      emCurso = true;
      try {
        await guardar(Store.obter());
      } catch (e) {
        console.warn('[Novari] gravação automática falhou:', e.message);
      } finally {
        emCurso = false;
        if (pendente) { pendente = false; agendar(); }
      }
    }

    function agendar() {
      clearTimeout(temporizador);
      temporizador = setTimeout(executar, ATRASO_AUTOSAVE);
    }

    Store.subscrever((p, alteracoes) => {
      if (!projetoId || ignorarAlteracoes) return;
      if (alteracoes && alteracoes.length && alteracoes.every((a) => a === 'selecao')) return;
      agendar();
    });

    // ao sair da página, grava o que ficou pendente
    global.addEventListener('pagehide', () => {
      if (!temporizador || !projetoId || !base) return;
      const corpo = JSON.stringify(Store.obter());
      if (corpo.length > 60000) return; // limite do keepalive
      try {
        fetch(base + '/projects/' + projetoId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true });
      } catch (e) { /* melhor esforço */ }
    });
  }

  // vistas: imagens do 3D (planificação) para o marceneiro — [{ nome, titulo, imagem: dataURL }]
  async function enviar(projeto, cliente, observacoes, vistas) {
    await guardar(projeto);
    return pedido('POST', '/projects/' + projetoId + '/send', {
      cliente,
      observacoes: observacoes || undefined,
      vistas: vistas && vistas.length ? vistas : undefined
    }, 60000);
  }

  /**
   * Liga o planejador ao backend, se existir.
   * opcoes: { Store, aoCarregar(projeto) }
   */
  async function iniciar(opcoes) {
    const ok = await disponivel();
    if (!ok) return false;
    // IA pelo servidor (a chave nunca vem para o navegador)
    if (iaConfigurada && !global.NOVARI_AI_CONFIG) global.NOVARI_AI_CONFIG = { endpoint: base + '/ai' };
    if (!MODO_LEITURA) ativarAutosave(opcoes.Store);
    const p = await recuperar(opcoes.Store);
    if (p && opcoes.aoCarregar) opcoes.aoCarregar(p);
    return true;
  }

  global.NovariAPI = {
    iniciar,
    disponivel,
    guardar,
    enviar,
    recuperar,
    modoLeitura: MODO_LEITURA,
    get emailConfigurado() { return emailConfigurado; },
    get projetoId() { return projetoId; }
  };
})(window);
