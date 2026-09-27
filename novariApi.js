/* ============================================================
   NOVARI — LIGAÇÃO AO BACKEND (opcional)
   Quando a API da Novari está disponível:
     - guarda e recupera projetos (GET/POST/PUT /api/projects)
     - guarda automaticamente as alterações (com debounce)
     - envia o projeto à Novari (POST /api/projects/:id/send)
     - liga o assistente à IA do servidor (POST /api/ai)
   Quando não está (ex.: site estático), o planejador continua
   a funcionar exatamente como antes (localStorage + mailto).
   Para apontar para outra API: window.NOVARI_API_URL = 'https://…/api'
   ============================================================ */
(function (global) {
  'use strict';

  const CHAVE_ID = 'novari-project-id';
  const PARAM_URL = 'projeto';
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

  function candidatos() {
    if (global.NOVARI_API_URL) return [String(global.NOVARI_API_URL).replace(/\/$/, '')];
    const loc = global.location;
    if (loc.protocol === 'file:') return ['http://localhost:3000/api'];
    const local = ['localhost', '127.0.0.1'].includes(loc.hostname);
    // Em produção só se usa a API quando NOVARI_API_URL está definido
    return local ? ['/api', 'http://localhost:3000/api'] : [];
  }

  function comTempoLimite(ms) {
    if (global.AbortSignal && AbortSignal.timeout) return AbortSignal.timeout(ms);
    return undefined;
  }

  // Verifica (uma vez) se a API responde
  function disponivel() {
    if (!verificacao) {
      verificacao = (async () => {
        for (const c of candidatos()) {
          try {
            const r = await fetch(c + '/health', { signal: comTempoLimite(2500) });
            const j = await r.json();
            if (j && j.success) {
              base = c;
              iaConfigurada = !!(j.data && j.data.ia && j.data.ia.configurada);
              return true;
            }
          } catch (e) { /* tenta o próximo */ }
        }
        return false;
      })();
    }
    return verificacao;
  }

  async function pedido(metodo, caminho, corpo) {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: corpo === undefined ? {} : { 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: comTempoLimite(15000)
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
    return armazenamento.ler();
  }

  async function guardar(projeto) {
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

  async function enviar(projeto, cliente, observacoes) {
    await guardar(projeto);
    return pedido('POST', '/projects/' + projetoId + '/send', { cliente, observacoes: observacoes || undefined });
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
    ativarAutosave(opcoes.Store);
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
    get projetoId() { return projetoId; }
  };
})(window);
