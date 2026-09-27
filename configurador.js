/* ============================================================
   NOVARI — PLANEJADOR 3D · INTERFACE
   Liga a interface existente (HTML/CSS) ao estado central,
   ao assistente e ao motor 3D. Não contém regras de negócio:
     estado/comandos → projectState.js
     conversa/IA     → aiParser.js
     3D              → furnitureAssemblyEngine.js
     catálogo        → furnitureCatalog.js
   ============================================================ */
(function () {
  'use strict';

  const C = window.NovariCatalog;
  const Store = window.NovariProject;
  const AI = window.NovariAI;
  const $ = (id) => document.getElementById(id);

  if (!C || !Store || !AI) {
    console.error('[Novari] Faltam scripts do planejador (catálogo, estado ou assistente).');
    return;
  }

  let motor = null;
  let ocupado = false;
  let ultimoTipoCatalogo = null;

  // ---------------------------------------------------------------
  // Utilidades de interface
  // ---------------------------------------------------------------
  function escapar(texto) {
    return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function definirTexto(id, valor) {
    const el = $(id);
    if (el) el.textContent = valor;
  }

  function showToast(mensagem) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = mensagem;
    toast.classList.add('show');
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  const dim = (m) => `${m.dimensoes.largura} × ${m.dimensoes.altura} × ${m.dimensoes.profundidade} cm`;

  // ---------------------------------------------------------------
  // Ambientes
  // ---------------------------------------------------------------
  function renderEnvironmentButtons(p) {
    const wrap = $('environmentButtons');
    if (!wrap) return;
    wrap.innerHTML = '';
    Object.entries(C.AMBIENTES).forEach(([key, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.className = 'segmented-item' + (p.tipo === key ? ' active' : '');
      btn.addEventListener('click', () => mudarAmbiente(key));
      wrap.appendChild(btn);
    });
  }

  function mudarAmbiente(tipo) {
    const p = Store.obter();
    if (p.tipo === tipo) return;
    // novo tipo de ambiente → a conversa guiada recomeça para esse tipo
    Store.executarVarios([
      { action: 'set_room_type', tipo },
      { action: 'update_conversation', reiniciar: true, respondidos: ['tipo'] }
    ]);
    if (motor) motor.enquadrar();
    const q = AI.proximaPergunta(Store.obter());
    adicionarMensagemIA(`Vamos planejar: ${C.AMBIENTES[tipo].toLowerCase()}.${q ? ' ' + q.texto : ''}`, q ? q.opcoes : null);
  }

  // ---------------------------------------------------------------
  // Catálogo (projetos prontos + módulos)
  // ---------------------------------------------------------------
  function renderCatalog(p) {
    const wrap = $('moduleCatalog');
    if (!wrap || ultimoTipoCatalogo === p.tipo) return;
    ultimoTipoCatalogo = p.tipo;
    wrap.innerHTML = '';

    const presets = C.PRESETS[p.tipo] || [];
    if (presets.length) {
      const grupo = document.createElement('div');
      grupo.className = 'catalog-group';
      grupo.innerHTML = '<div class="catalog-group-label">Projetos prontos</div>';
      presets.forEach((preset) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'module-card preset-card';
        button.innerHTML = `<div><strong>${escapar(preset.nome)}</strong><small>${escapar(preset.descricao)}</small></div><span>Visualizar</span>`;
        button.addEventListener('click', () => {
          const r = Store.executarVarios([
            { action: 'load_preset', id: preset.id },
            { action: 'update_conversation', respondidos: ['tipo', 'largura', 'profundidade', 'altura'] }
          ])[0];
          if (motor) motor.enquadrar();
          showToast(r.mensagem || 'Projeto carregado.');
        });
        grupo.appendChild(button);
      });
      wrap.appendChild(grupo);
    }

    const grupo = document.createElement('div');
    grupo.className = 'catalog-group';
    grupo.innerHTML = '<div class="catalog-group-label">Módulos</div>';
    C.listarPorAmbiente(p.tipo).forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'module-card';
      button.innerHTML = `<div><strong>${escapar(item.nome)}</strong><small>${item.largura} × ${item.altura} × ${item.profundidade} cm</small></div><span>+ Add</span>`;
      button.addEventListener('click', () => {
        const r = Store.executar({ action: 'add_module', catalogoId: item.id });
        showToast(r.mensagem);
      });
      grupo.appendChild(button);
    });
    wrap.appendChild(grupo);
  }

  // ---------------------------------------------------------------
  // Inspetor do módulo selecionado
  // ---------------------------------------------------------------
  function renderInspector(p) {
    const wrap = $('selectedModuleInspector');
    if (!wrap) return;
    const m = p.modulos.find((item) => item.id === p.selecionado);

    // Não reescreve os campos enquanto o utilizador está a escrever neles
    if (m && wrap.dataset.moduloId === m.id && wrap.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    wrap.dataset.moduloId = m ? m.id : '';

    if (!m) {
      wrap.innerHTML = '<p>Selecione um módulo no 3D para editar medidas e componentes. Arraste-o para mover; duplo clique numa porta ou gaveta abre-a.</p>';
      return;
    }

    const c = m.componentes;
    const preco = C.precoModulo(m, p).total;
    const suporta = (k) => C.suporta(m, k);
    const botoes = [];
    const btn = (acao, rotulo, id) => botoes.push(`<button type="button" class="secondary-btn" data-acao="${acao}"${id ? ` id="${id}"` : ''}>${rotulo}</button>`);
    btn('duplicar', 'Duplicar', 'duplicateModuleBtn');
    if (!m.parede) btn('girar', 'Girar 90°', 'rotateModuleBtn');
    if (suporta('gaveta')) { btn('gaveta+', '+ Gaveta'); btn('gaveta-', '− Gaveta'); }
    if (suporta('prateleira')) { btn('prateleira+', '+ Prateleira'); btn('prateleira-', '− Prateleira'); }
    if (suporta('varao')) { btn('varao+', '+ Varão'); btn('varao-', '− Varão'); }
    if (suporta('sapateira')) btn('sapateira', c.sapateira ? 'Sem sapateira' : 'Sapateira');
    if (suporta('espelho') && c.tipoPorta !== 'nenhuma') btn('espelho', c.espelho ? 'Sem espelho' : 'Espelho');
    if (suporta('led')) btn('led', c.led ? 'Remover LED' : 'Adicionar LED', 'toggleAccessoryBtn');
    const temPortas = (c.portas || 0) > 0 || c.forno || c.lavaLoica || c.frigorifico || m.tipo === 'ilha';
    if (temPortas && motor) btn('portas', motor.estaAberto(m.id, 'portas') ? 'Fechar portas' : 'Abrir portas', 'toggleDoorBtn');
    if ((c.gavetas || 0) > 0 && motor) btn('gavetas', motor.estaAberto(m.id, 'gavetas') ? 'Fechar gavetas' : 'Abrir gavetas', 'toggleDrawerBtn');
    btn('remover', 'Remover', 'removeModuleBtn');

    const linhas = [];
    if (c.portas !== undefined) linhas.push(['Portas', c.portas]);
    if (c.gavetas !== undefined) linhas.push(['Gavetas', c.gavetas]);
    if (c.prateleiras !== undefined) linhas.push(['Prateleiras', c.prateleiras]);
    if (c.varoes !== undefined) linhas.push(['Varões', c.varoes]);
    linhas.push(['Valor aprox.', C.formatarMoeda(preco)]);

    const campo = (rotulo, attr, valor, extra) => `<div><label>${rotulo}</label><input type="number" ${attr} value="${valor}" ${extra || ''}></div>`;
    const lim = C.limites(m);
    wrap.innerHTML = `
      <div class="summary-title-row">
        <h3>${escapar(m.nome)}</h3>
        <span class="tag">Selecionado</span>
      </div>
      <div class="inspector-grid">
        ${campo('Largura (cm)', 'data-dimensao="largura"', m.dimensoes.largura, `min="${lim.larguraMin}" max="${lim.larguraMax}" step="1"`)}
        ${campo('Altura (cm)', 'data-dimensao="altura"', m.dimensoes.altura, `min="${lim.alturaMin}" max="${lim.alturaMax}" step="1"`)}
        ${campo('Profundidade (cm)', 'data-dimensao="profundidade"', m.dimensoes.profundidade, `min="${lim.profundidadeMin}" max="${lim.profundidadeMax}" step="1"`)}
        ${campo('Posição X (cm)', 'data-posicao="x"', m.posicao.x, 'step="1"' + (m.parede === 'esquerda' || m.parede === 'direita' ? ' disabled' : ''))}
        ${campo('Posição Z (cm)', 'data-posicao="z"', m.posicao.z, 'step="1"' + (m.parede === 'fundo' ? ' disabled' : ''))}
        ${campo('Rotação (°)', 'data-rotacao', m.rotacao || 0, 'step="15"' + (m.parede ? ' disabled' : ''))}
      </div>
      <div class="inspector-actions">${botoes.join('')}</div>
      ${linhas.map(([k, v]) => `<div class="budget-row"><span>${k}</span><strong>${v}</strong></div>`).join('')}
    `;

    wrap.querySelectorAll('input[data-dimensao]').forEach((input) => {
      input.addEventListener('change', (e) => {
        const r = Store.executar({ action: 'resize_module', id: m.id, [e.target.dataset.dimensao]: Number(e.target.value) });
        if (!r.ok) showToast(r.mensagem);
        renderInspector(Store.obter());
      });
    });
    wrap.querySelectorAll('input[data-posicao]').forEach((input) => {
      input.addEventListener('change', (e) => {
        const r = Store.executar({ action: 'move_module', id: m.id, [e.target.dataset.posicao]: Number(e.target.value) });
        if (!r.ok) showToast(r.mensagem);
        renderInspector(Store.obter());
      });
    });
    const rot = wrap.querySelector('input[data-rotacao]');
    if (rot) {
      rot.addEventListener('change', (e) => {
        const r = Store.executar({ action: 'rotate_module', id: m.id, graus: Number(e.target.value), absoluto: true });
        if (!r.ok) showToast(r.mensagem);
        renderInspector(Store.obter());
      });
    }
    wrap.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', () => acaoInspector(b.dataset.acao, m)));
  }

  function acaoInspector(acao, m) {
    const mapa = {
      duplicar: { action: 'duplicate_module', id: m.id },
      girar: { action: 'rotate_module', id: m.id, graus: 90 },
      remover: { action: 'remove_module', id: m.id },
      'gaveta+': { action: 'add_drawer', id: m.id },
      'gaveta-': { action: 'remove_drawer', id: m.id },
      'prateleira+': { action: 'add_shelf', id: m.id },
      'prateleira-': { action: 'remove_shelf', id: m.id },
      'varao+': { action: 'add_rod', id: m.id },
      'varao-': { action: 'remove_rod', id: m.id },
      led: { action: 'toggle_component', componente: 'led', id: m.id },
      espelho: { action: 'toggle_component', componente: 'espelho', id: m.id },
      sapateira: { action: 'toggle_component', componente: 'sapateira', id: m.id }
    };
    if (acao === 'portas' && motor) {
      motor.alternarPortas(m.id);
      renderInspector(Store.obter());
      return;
    }
    if (acao === 'gavetas' && motor) {
      motor.alternarGavetas(m.id);
      renderInspector(Store.obter());
      return;
    }
    const cmd = mapa[acao];
    if (!cmd) return;
    const r = Store.executar(cmd);
    showToast(r.mensagem || (r.ok ? 'Atualizado.' : 'Não foi possível.'));
  }

  // ---------------------------------------------------------------
  // Orçamento e resumo
  // ---------------------------------------------------------------
  function renderBudget(p) {
    const wrap = $('budgetSummary');
    if (!wrap) return;
    const orc = Store.calcularOrcamento(p);
    wrap.innerHTML = `
      ${orc.linhas.map((l) => `<div class="budget-row"><span>${l.rotulo}</span><strong>${C.formatarMoeda(l.valor)}</strong></div>`).join('')}
      <div class="budget-row"><span>Estimativa indicativa — não é o orçamento final da Novari.</span></div>
      <div class="budget-total"><span>Valor aproximado</span><span>${C.formatarMoeda(orc.total)}</span></div>
    `;
  }

  function renderProjectSummary(p) {
    const wrap = $('projectSummary');
    if (!wrap) return;
    const orc = Store.calcularOrcamento(p);
    const linhas = [
      ['Ambiente', C.AMBIENTES[p.tipo]],
      ['Dimensões', `${p.espaco.largura} × ${p.espaco.profundidade} × ${p.espaco.altura} cm`]
    ];
    if (p.tipo === 'cozinha') {
      linhas.push(['Formato', p.preferencias.formato === 'L' ? 'Em L' : 'Linear']);
      linhas.push(['Eletrodomésticos', p.eletrodomesticos.length ? p.eletrodomesticos.map((k) => C.ELETRODOMESTICOS[k]).join(', ') : '—']);
    }
    if (p.tipo === 'roupeiro') {
      const tot = (k) => p.modulos.reduce((s, m) => s + (m.componentes[k] || 0), 0);
      const tipoPorta = { abrir: 'de abrir', correr: 'de correr', nenhuma: 'sem portas' }[p.preferencias.tipoPorta] || '';
      linhas.push(['Portas', `${tot('portas')} ${tipoPorta}`]);
      linhas.push(['Interior', `${tot('gavetas')} gavetas · ${tot('varoes')} varões · ${tot('prateleiras')} prateleiras`]);
    }
    linhas.push(['Módulos', String(p.modulos.length)]);
    linhas.push(['Material', C.MATERIAIS[p.material].nome]);
    linhas.push(['Acabamento', p.acabamento]);
    linhas.push(['Estilo', (C.ESTILOS[p.estilo] || C.ESTILOS.moderno).nome]);
    if (p.observacoes) linhas.push(['Observações', p.observacoes]);
    linhas.push(['Valor aproximado', C.formatarMoeda(orc.total)]);
    wrap.innerHTML = linhas.map(([k, v]) => `<li><span>${k}</span><strong>${escapar(v)}</strong></li>`).join('');

    // IDs opcionais (atualizados apenas se existirem no HTML)
    definirTexto('projectTypeLabel', C.AMBIENTES[p.tipo]);
    definirTexto('spaceDimensions', `${p.espaco.largura} × ${p.espaco.profundidade} × ${p.espaco.altura} cm`);
    definirTexto('elementCount', String(p.modulos.length));
    definirTexto('projectState', p.estado === 'projeto_gerado' ? 'Projeto gerado' : 'Em configuração');
    definirTexto('projectName', `${C.AMBIENTES[p.tipo]} Novari`);
  }

  // ---------------------------------------------------------------
  // Conversa
  // ---------------------------------------------------------------
  function prepararChat() {
    const wrap = $('aiSuggestions');
    if (!wrap) return;
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';
    wrap.style.maxHeight = '360px';
    wrap.style.overflowY = 'auto';
    wrap.setAttribute('aria-live', 'polite');
  }

  function renderChat(p) {
    const wrap = $('aiSuggestions');
    if (!wrap) return;
    const hist = p.conversa.historico;
    const ultimaIA = hist.map((h) => h.autor).lastIndexOf('ia');
    wrap.innerHTML = hist
      .map((h, i) => {
        if (h.autor === 'cliente') {
          return `<div class="ai-suggestion" style="background:transparent;border-style:dashed"><strong>Você:</strong> ${escapar(h.texto)}</div>`;
        }
        const opcoes = i === ultimaIA && i === hist.length - 1 && h.opcoes && !ocupado
          ? `<div class="segmented-list" style="margin-top:10px">${h.opcoes.map((o) => `<button type="button" class="segmented-item" data-resposta="${escapar(o)}">${escapar(o)}</button>`).join('')}</div>`
          : '';
        return `<div class="ai-suggestion">${escapar(h.texto)}${opcoes}</div>`;
      })
      .join('');
    if (ocupado) wrap.insertAdjacentHTML('beforeend', '<div class="ai-suggestion">…</div>');
    wrap.querySelectorAll('[data-resposta]').forEach((b) => b.addEventListener('click', () => enviarMensagem(b.dataset.resposta)));
    wrap.scrollTop = wrap.scrollHeight;
  }

  function adicionarMensagemIA(texto, opcoes) {
    Store.executar({ action: 'chat_message', autor: 'ia', texto, opcoes: opcoes || null });
  }

  function definirOcupado(valor) {
    ocupado = valor;
    ['askAiBtn', 'generateProjectBtn'].forEach((id) => {
      const b = $(id);
      if (b) b.disabled = valor;
    });
    renderChat(Store.obter());
  }

  async function enviarMensagem(texto) {
    const mensagem = String(texto || '').trim();
    if (!mensagem || ocupado) return;
    const prompt = $('aiPrompt');
    if (prompt) prompt.value = '';

    const antes = Store.obter();
    const totalAntes = Store.calcularOrcamento(antes).total;
    const eraGerado = antes.conversa.concluida;
    const nModulosAntes = antes.modulos.length;
    Store.executar({ action: 'chat_message', autor: 'cliente', texto: mensagem });
    definirOcupado(true);

    let resultado;
    try {
      resultado = await AI.processar(mensagem, Store.obter());
    } catch (e) {
      console.error('[Novari] erro no assistente', e);
      resultado = { origem: 'local', comandos: [], resposta: 'Ocorreu um erro ao interpretar a mensagem. Tente novamente.', ui: [] };
    }

    const execucoes = Store.executarVarios(resultado.comandos || []);
    (resultado.ui || []).forEach(executarAcaoUI);

    let saida = AI.compor(Store.obter(), resultado, execucoes, totalAntes);
    if (resultado.origem === 'api' && resultado.concluida) saida.concluir = true;
    if (saida.concluir && !Store.obter().conversa.concluida) {
      Store.executarVarios([
        { action: 'update_conversation', concluida: true, perguntaAtual: null },
        { action: 'set_state', estado: 'projeto_gerado' }
      ]);
      saida = { texto: `${saida.texto ? saida.texto + ' ' : ''}${AI.mensagemConclusao(Store.obter())}`, opcoes: null };
      if (motor) motor.enquadrar();
    }
    definirOcupado(false);
    adicionarMensagemIA(saida.texto || 'Feito.', saida.opcoes);

    // enquadra a câmera quando o ambiente é (re)criado
    const gerou = execucoes.some((e) => e.ok && (e.action === 'generate_layout' || e.action === 'reset_project' || e.action === 'set_room_type'));
    const p = Store.obter();
    if (motor && gerou && (!eraGerado || Math.abs(p.modulos.length - nModulosAntes) > 2)) motor.enquadrar();
  }

  function executarAcaoUI(acao) {
    if (!motor) return;
    if (acao === 'enquadrar') setTimeout(() => motor.enquadrar(), 30);
    else if (acao === 'abrir_tudo') motor.abrirTudo(true);
    else if (acao === 'abrir_gavetas') motor.abrirGavetas(true);
    else if (acao === 'fechar_tudo') motor.abrirTudo(false);
    else if (acao === 'reiniciar_conversa') iniciarConversa(true);
  }

  function iniciarConversa(reiniciar) {
    if (reiniciar) AI.reiniciar();
    const inicio = AI.mensagemInicial();
    adicionarMensagemIA(inicio.texto, inicio.opcoes);
  }

  function gerarProjeto() {
    const prompt = $('aiPrompt');
    const texto = prompt ? prompt.value.trim() : '';
    const concluir = () => {
      const p = Store.obter();
      if (p.conversa.concluida) {
        const r = Store.executar({ action: 'generate_layout' });
        adicionarMensagemIA(`Refiz o layout a partir das suas preferências.${r.mensagem ? ' ' + r.mensagem : ''} ${AI.mensagemConclusao(Store.obter())}`);
      } else {
        Store.executarVarios(AI.completarComPadroes(p));
        adicionarMensagemIA(`Completei o que faltava com as opções mais comuns. ${AI.mensagemConclusao(Store.obter())}`);
      }
      if (motor) motor.enquadrar();
      showToast('Projeto gerado em 3D.');
    };
    if (texto) enviarMensagem(texto).then(concluir);
    else concluir();
  }

  // ---------------------------------------------------------------
  // Guardar / enviar
  // ---------------------------------------------------------------
  function saveProject() {
    const p = Store.obter();
    const payload = Object.assign({}, Store.resumoParaIA(p), { observacoes: p.observacoes, guardadoEm: new Date().toISOString() });
    try {
      localStorage.setItem('novari-project', JSON.stringify(payload));
      showToast('Projeto guardado localmente.');
    } catch (e) {
      showToast('Não foi possível guardar neste navegador.');
    }
  }

  function sendProjectByEmail() {
    const p = Store.obter();
    const name = $('clientName').value.trim() || 'Cliente';
    const email = $('clientEmail').value.trim() || 'Não informado';
    const phone = $('clientPhone').value.trim() || 'Não informado';
    const notes = $('clientNotes').value.trim() || 'Sem observações adicionais.';
    const orc = Store.calcularOrcamento(p);
    const modulos = p.modulos.map((m) => `- ${m.nome} (${dim(m)})`).join('\n');
    const body = [
      'NOVO PROJETO RECEBIDO', '',
      'CLIENTE', `Nome: ${name}`, `Email: ${email}`, `Telefone: ${phone}`, '',
      'PROJETO',
      `Tipo: ${C.AMBIENTES[p.tipo]}`,
      `Dimensões: ${p.espaco.largura} × ${p.espaco.profundidade} × ${p.espaco.altura} cm`,
      `Material: ${C.MATERIAIS[p.material].nome}`,
      `Acabamento: ${p.acabamento}`,
      `Estilo: ${(C.ESTILOS[p.estilo] || C.ESTILOS.moderno).nome}`, '',
      'CONFIGURAÇÃO', modulos || 'Nenhum módulo definido.', '',
      'VALOR APROXIMADO (não é orçamento final)', C.formatarMoeda(orc.total), '',
      'OBSERVAÇÕES', [p.observacoes, notes].filter(Boolean).join(' ')
    ].join('\n');
    window.location.href = `mailto:novarimobiliarioexclusivo@gmail.com?subject=${encodeURIComponent('Novo projeto personalizado — Novari')}&body=${encodeURIComponent(body)}`;
    showToast('Email preparado para envio.');
  }

  // ---------------------------------------------------------------
  // Controlos
  // ---------------------------------------------------------------
  function bindControls() {
    const campos = { roomWidth: 'largura', roomDepth: 'profundidade', roomHeight: 'altura' };
    let temporizador = null;
    Object.entries(campos).forEach(([id, chave]) => {
      const input = $(id);
      if (!input) return;
      const aplicar = () => {
        const valor = Number(input.value);
        if (!valor) return;
        const r = Store.executar({ action: 'set_room_dimensions', [chave]: valor, unidade: 'cm' });
        if (r.mensagem && /Atenção/.test(r.mensagem)) showToast(r.mensagem);
      };
      input.addEventListener('input', () => {
        clearTimeout(temporizador);
        temporizador = setTimeout(aplicar, 450);
      });
      input.addEventListener('change', () => {
        clearTimeout(temporizador);
        aplicar();
        if (motor) motor.enquadrar();
      });
    });

    $('materialSelect').addEventListener('change', (e) => Store.executar({ action: 'change_material', material: e.target.value }));
    $('finishSelect').addEventListener('change', (e) => Store.executar({ action: 'change_finish', acabamento: e.target.value }));

    $('resetProjectBtn').addEventListener('click', () => {
      Store.executar({ action: 'reset_project', tipo: Store.obter().tipo });
      iniciarConversa(true);
      if (motor) motor.enquadrar();
      showToast('Projeto reiniciado.');
    });
    $('saveProjectBtn').addEventListener('click', saveProject);
    $('sendProjectBtn').addEventListener('click', sendProjectByEmail);
    $('askAiBtn').addEventListener('click', () => enviarMensagem($('aiPrompt').value));
    $('generateProjectBtn').addEventListener('click', gerarProjeto);
    $('aiPrompt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviarMensagem(e.target.value);
      }
    });

    document.querySelectorAll('[data-camera-preset]').forEach((button) => {
      button.addEventListener('click', () => motor && motor.camera(button.dataset.cameraPreset));
    });
  }

  function sincronizarCampos(p) {
    const valores = { roomWidth: p.espaco.largura, roomDepth: p.espaco.profundidade, roomHeight: p.espaco.altura, materialSelect: p.material, finishSelect: p.acabamento };
    Object.entries(valores).forEach(([id, v]) => {
      const el = $(id);
      if (el && document.activeElement !== el && String(el.value) !== String(v)) el.value = v;
    });
  }

  // ---------------------------------------------------------------
  // Renderização geral (reage a qualquer mudança do estado)
  // ---------------------------------------------------------------
  function renderAll(p, alteracoes) {
    // mensagens do chat não precisam de redesenhar o resto
    if (alteracoes && alteracoes.length === 1 && alteracoes[0] === 'conversa') {
      renderChat(p);
      return;
    }
    if (motor) {
      try {
        motor.render(p);
      } catch (e) {
        console.error('[Novari] erro ao renderizar o 3D', e);
      }
    }
    renderEnvironmentButtons(p);
    renderCatalog(p);
    renderBudget(p);
    renderProjectSummary(p);
    renderInspector(p);
    renderChat(p);
    sincronizarCampos(p);
  }

  function iniciarMotor() {
    const container = $('modelo3d');
    if (!container) return;
    const loading = $('loading3D');
    try {
      motor = window.NovariEngine3D.criar(container, {
        onSelect: (id) => Store.executar({ action: 'select_module', id }),
        onMove: (id, x, z) => Store.executar({ action: 'move_module', id, x, z }),
        restringir: (id, x, z) => Store.restringir(id, x, z)
      });
      if (loading) loading.hidden = true;
    } catch (e) {
      console.error('[Novari] não foi possível iniciar o 3D', e);
      motor = null;
      const erro = $('error3D');
      if (erro) erro.hidden = false;
      else {
        container.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:#5a4a3a;font-size:14px">Não foi possível iniciar a visualização 3D neste navegador (WebGL indisponível). O assistente, o resumo e o orçamento continuam a funcionar.</div>';
      }
      if (loading) loading.hidden = true;
    }
  }

  function init() {
    prepararChat();
    iniciarMotor();
    Store.subscrever(renderAll);
    bindControls();
    renderAll(Store.obter());
    if (motor) motor.enquadrar(true);
    iniciarConversa(false);
    window.__NOVARI__ = { Store, AI, C, motor };
  }

  init();
})();
