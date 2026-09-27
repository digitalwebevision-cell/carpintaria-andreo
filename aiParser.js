/* ============================================================
   NOVARI — ASSISTENTE (INTERPRETAÇÃO + CONDUÇÃO DA CONVERSA)

   Camadas, claramente separadas:
   1. processarComIA()   → ponto de integração com uma API real.
                            Só é usado se window.NOVARI_AI_CONFIG.endpoint
                            estiver definido. Nenhuma API é inventada aqui.
   2. processarLocal()   → interpretador local (regras de linguagem natural)
                            para testes. Transforma frases em comandos.
   3. Roteiro            → perguntas, uma de cada vez, conforme o que falta.
   O estado do projeto só muda através dos comandos devolvidos.
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.NovariCatalog;

  // ---------------------------------------------------------------
  // Normalização de texto
  // ---------------------------------------------------------------
  const NUMEROS = {
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
    onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100
  };
  const QTD_PALAVRAS = 'portas?|gavetas?|varoes|varao|prateleiras?|modulos?|colunas?|pessoas|armarios?|cabides|seccoes|secoes|lugares|filhos|anos';

  function semAcentos(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function normalizar(texto) {
    let t = semAcentos(texto).toLowerCase();
    t = t.replace(/[–—]/g, '-');
    t = t.replace(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem)\b/g, (w) => String(NUMEROS[w]));
    t = t.replace(/(\d),(\d)/g, '$1.$2');
    t = t.replace(/(\d+)\s*m\s*(\d{2})\b/g, '$1.$2 m'); // 3m60
    t = t.replace(/(\d+)\s*(metros?|m)\s*e\s*meio\b/g, '$1.5 $2');
    t = t.replace(/(\d+)\s*e\s*meio\b/g, '$1.5');
    t = t.replace(new RegExp('(\\d+)\\s*(metros?|m)\\s*e\\s*(\\d{1,2})\\b(?!\\s*(' + QTD_PALAVRAS + '))', 'g'), (_, a, u, b) => `${a}.${b.padStart(2, '0')} ${u}`);
    return t.replace(/\s+/g, ' ').trim();
  }

  // ---------------------------------------------------------------
  // Medidas
  // ---------------------------------------------------------------
  const PAPEL_ANTES = [
    ['profundidade', /(profundidade|profund|fundo)\D{0,25}$/],
    ['altura', /(altura|alto|pe[ -]direito|teto|tecto)\D{0,25}$/],
    ['largura', /(largura|largo|parede|comprimento|frente|mede|tem)\D{0,25}$/]
  ];
  const PAPEL_DEPOIS = [
    ['profundidade', /^\s*(de )?(profundidade|fundo)/],
    ['altura', /^\s*(de )?(altura|pe[ -]direito)/],
    ['largura', /^\s*(de )?(largura|comprimento|largo)/]
  ];

  function paraCm(valor, unidade) {
    const v = Number(valor);
    if (!Number.isFinite(v)) return null;
    if (/^m/.test(unidade || '') && !/^mm|^mil/.test(unidade)) return Math.round(v * 100);
    if (/^c/.test(unidade || '')) return Math.round(v);
    if (/^mm|^mil/.test(unidade || '')) return Math.round(v / 10);
    if (v <= 12) return Math.round(v * 100);
    if (v <= 1500) return Math.round(v);
    return Math.round(v / 10);
  }

  function extrairMedidas(t, campoAtual) {
    const medidas = [];
    const x = t.match(/(\d+(?:\.\d+)?)\s*(m|cm)?\s*(?:x|por)\s*(\d+(?:\.\d+)?)\s*(m|cm)?(?:\s*(?:x|por)\s*(\d+(?:\.\d+)?)\s*(m|cm)?)?/);
    if (x) {
      const unidadeFinal = x[6] || x[4] || x[2];
      medidas.push({ cm: paraCm(x[1], x[2] || unidadeFinal), papel: 'largura' });
      medidas.push({ cm: paraCm(x[3], x[4] || unidadeFinal), papel: 'profundidade' });
      if (x[5]) medidas.push({ cm: paraCm(x[5], x[6] || unidadeFinal), papel: 'altura' });
      return medidas;
    }
    const re = /(\d+(?:\.\d+)?)\s*(metros|metro|mts|mt|m|centimetros|centimetro|cms|cm|milimetros|mm)?(?![a-z0-9])/g;
    let fimAnterior = 0;
    let match;
    while ((match = re.exec(t))) {
      const inicio = match.index;
      const fim = inicio + match[0].length;
      const depois = t.slice(fim, fim + 22);
      if (new RegExp('^\\s*(' + QTD_PALAVRAS + ')').test(depois)) { fimAnterior = fim; continue; }
      const antes = t.slice(Math.max(fimAnterior, inicio - 35), inicio);
      let papel = null;
      for (const [p, r] of PAPEL_DEPOIS) if (r.test(depois)) { papel = p; break; }
      if (!papel) for (const [p, r] of PAPEL_ANTES) if (r.test(antes)) { papel = p; break; }
      const unidade = match[2] || '';
      const campoDim = ['largura', 'profundidade', 'altura', 'profundidadeMovel'].includes(campoAtual);
      if (!unidade && !papel && !campoDim) { fimAnterior = fim; continue; }
      // número solto seguido de substantivo ("1 parede", "2 filhos") não é medida
      if (!unidade && /^\s*[a-z]/.test(depois) && !/^\s*(x|por|de (largura|profundidade|altura|fundo|comprimento|pe direito))\b/.test(depois)) { fimAnterior = fim; continue; }
      const cm = paraCm(match[1], unidade);
      if (cm && cm >= 20 && cm <= 2000) medidas.push({ cm, papel, comUnidade: !!unidade });
      fimAnterior = fim;
    }
    return medidas;
  }

  function quantidade(t, palavra) {
    const m = t.match(new RegExp('(\\d+)\\s*(?:\\w+\\s)?(' + palavra + ')'));
    return m ? Number(m[1]) : null;
  }

  function posicaoLado(t) {
    if (/(esquerd)/.test(t)) return 'esquerda';
    if (/(direit)/.test(t)) return 'direita';
    if (/(meio|centro|central|centrad)/.test(t)) return 'centro';
    return null;
  }

  const SIM = /^(sim|s|claro|quero|pode ser|pode|isso|ok|yes|com certeza|gostaria|adoraria|perfeito|boa)\b/;
  const NAO = /^(nao|n|dispenso|sem|nenhum|nenhuma|nada|no)\b/;
  const PULAR = /(nao sei|tanto faz|pode escolher|escolhe tu|escolha voce|sugira|sugere|sugestao|voce decide|decide|qualquer|pular|salta|salte|indiferente|como achar)/;

  // ---------------------------------------------------------------
  // Extração de factos (respostas às perguntas + frases livres)
  // ---------------------------------------------------------------
  function extrairEletro(t) {
    const itens = [];
    const neg = (re) => new RegExp('(sem|nao quero|nao preciso de|retir\\w*|tir\\w*|remov\\w*)\\s+(a |o |de |do |da )?(\\w+\\s)?' + re.source).test(t);
    const regras = [
      ['frigorifico', /(frigorifico|geladeira|geleira|combinado)/],
      ['forno', /\bforno/],
      ['microondas', /micro[- ]?ondas/],
      ['lavaLoica', /(maquina de (lavar )?lo[ui]?[ci]?a|lava[- ]?lou?i?cas\b|maquina da lo|lava[- ]?lou?i?ca (de |a )?maquina|dishwasher)/],
      ['placa', /(placa|fogao|cooktop|induc|vitroceram|bocas)/],
      ['exaustor', /(exaustor|coifa|depurador|extrator)/]
    ];
    regras.forEach(([k, re]) => {
      if (re.test(t)) itens.push({ k, negado: neg(re) });
    });
    return itens;
  }

  function extrairFatos(texto, projeto, campoAtual) {
    const t = normalizar(texto);
    const f = {};
    const conv = projeto.conversa;
    const tipo = f.tipo || projeto.tipo;

    // --- tipo de ambiente
    const querMudar = /(mudar|trocar|passar|agora quero|prefiro|em vez)/.test(t);
    if (!conv.respondidos.tipo || querMudar || campoAtual === 'tipo') {
      const iCoz = t.search(/\bcozinha/);
      const iRou = t.search(/(roupeiro|closet|guarda[- ]?roupas?|wardrobe|armario de roupa|armario para roupa)/);
      if (iCoz >= 0 && (iRou < 0 || iCoz < iRou)) f.tipo = 'cozinha';
      else if (iRou >= 0) f.tipo = 'roupeiro';
      else if (/\bsala\b/.test(t) && querMudar) f.tipo = 'sala';
    }
    const tipoFinal = f.tipo || tipo;

    // --- medidas
    extrairMedidas(t, campoAtual).forEach((m) => {
      let papel = m.papel;
      if (!papel && ['largura', 'profundidade', 'altura'].includes(campoAtual)) papel = campoAtual;
      if (!papel && campoAtual === 'profundidadeMovel') papel = 'profundidadeMovel';
      if (!papel && !conv.respondidos.largura) papel = 'largura';
      if (!papel) return;
      if (f[papel] === undefined) f[papel] = m.cm;
    });
    if (f.profundidadeMovel !== undefined && (f.profundidadeMovel < 30 || f.profundidadeMovel > 80)) delete f.profundidadeMovel;

    // --- até ao teto
    if (/ate (a|ao|o) (teto|tecto)|ate ao cimo|altura total/.test(t)) f.ateTeto = true;
    if (campoAtual === 'ateTeto') {
      if (SIM.test(t)) f.ateTeto = true;
      else if (NAO.test(t)) f.ateTeto = false;
    }

    // --- acabamento / material / estilo
    if (/\b(branc[oa]s?|alva)\b/.test(t)) f.acabamento = 'Branco';
    else if (/\b(pret[oa]s?|negr[oa]|grafite)\b/.test(t)) f.acabamento = 'Preto';
    else if (/\b(cinza|cinzent[oa]|antracite|chumbo)\b/.test(t)) f.acabamento = 'Cinza';
    else if (/(nogueira|madeira escura|castanho|imbuia|tabaco)/.test(t)) f.acabamento = 'Nogueira';
    else if (/(carvalho|madeira clara|amadeirad|freijo|natural clar|\bmadeira\b(?! macica| natural| solida))/.test(t)) f.acabamento = 'Carvalho';

    if (/(madeira macica|macica|madeira natural|madeira solida)/.test(t)) f.material = 'Madeira';
    else if (/\bmdf\b/.test(t)) f.material = 'MDF';
    else if (/(compensado|contraplacado)/.test(t)) f.material = 'Compensado';

    const estilos = [['minimalista', /minimalist/], ['industrial', /industrial/], ['classico', /classic/], ['rustico', /rustic/], ['escandinavo', /escandinav|nordic/], ['contemporaneo', /contemporane/], ['moderno', /modern/]];
    for (const [k, re] of estilos) if (re.test(t)) { f.estilo = k; break; }

    // --- COZINHA
    if (tipoFinal === 'cozinha') {
      if (/(em l\b|forma de l|formato (em )?l\b|\bem ele\b|canto|duas paredes)/.test(t)) f.formato = 'L';
      else if (/(linear|uma (so )?parede|so uma parede|em linha|reta|direita ao longo)/.test(t) || (campoAtual === 'formato' && /(linear|1 parede)/.test(t))) f.formato = 'linear';

      // janela
      if (/janela/.test(t) || campoAtual === 'janela') {
        if (/(nao (ha|tem|tenho|existe)|sem janela|nenhuma|^nao\b)/.test(t)) f.janela = 'nenhuma';
        else {
          const lado = posicaoLado(t);
          if (lado) f.janela = lado;
          else if (/janela/.test(t) && /(tenho|ha|existe|tem)/.test(t)) f.janela = 'centro';
        }
      }
      // porta de entrada
      if ((/\bporta\b/.test(t) && !/portas/.test(t)) || campoAtual === 'porta') {
        if (/(frente|em frente|oposta|entrada aberta|sem porta|aberta)/.test(t)) f.porta = 'frente';
        else if (/esquerd/.test(t)) f.porta = 'esquerda';
        else if (/direit/.test(t)) f.porta = 'direita';
        else if (/fundo/.test(t)) f.porta = 'frente';
      }
      // água / pia
      if (/(\bpia\b|ponto de agua|\bagua\b|torneira|lava[- ]?loica\b|cuba)/.test(t) || campoAtual === 'agua') {
        if (/(janela|debaixo|sob a|por baixo)/.test(t)) f.agua = 'janela';
        else {
          const lado = posicaoLado(t);
          if (lado) f.agua = lado;
        }
      }
      // placa
      if (/\bgas\b|a gas/.test(t)) f.placa = 'gas';
      else if (/induc/.test(t)) f.placa = 'inducao';
      else if (/vitroceram|eletric/.test(t)) f.placa = 'vitro';

      // eletrodomésticos
      const eletro = extrairEletro(t);
      if (campoAtual === 'eletrodomesticos') {
        if (/(todos|tudo|completo)/.test(t)) f.eletrodomesticos = Object.keys(C.ELETRODOMESTICOS);
        else if (/^(nenhum|nao|sem)/.test(t)) f.eletrodomesticos = [];
        else if (eletro.length) {
          const lista = new Set(eletro.filter((e) => !e.negado).map((e) => e.k));
          if (!eletro.some((e) => e.k === 'placa' && e.negado)) lista.add('placa');
          if (!eletro.some((e) => e.k === 'exaustor' && e.negado)) lista.add('exaustor');
          f.eletrodomesticos = Array.from(lista);
        }
      } else if (eletro.length) {
        f.eletroAdd = eletro.filter((e) => !e.negado).map((e) => e.k);
        f.eletroRem = eletro.filter((e) => e.negado).map((e) => e.k);
      }
      if (/(\d+)\s*colunas?\s*(para|de)?\s*(eletro|forno)/.test(t)) f.eletroAdd = (f.eletroAdd || []).concat(['forno', 'microondas']);

      // armazenamento
      if (/(muit[oa]|bastante|maximo|mais|imens[oa]|grande) (espaco|arrumacao|armazenamento|arrumos)|preciso de muito|muito armazenamento/.test(t) || (campoAtual === 'armazenamento' && /(muito|bastante|alto|grande)/.test(t))) f.armazenamento = 'alto';
      else if (/(pouc[oa]) (espaco|arrumacao|armazenamento)/.test(t) || (campoAtual === 'armazenamento' && /(pouco|baixo|minimo)/.test(t))) f.armazenamento = 'baixo';
      else if (campoAtual === 'armazenamento' && /(medio|normal|media|razoavel)/.test(t)) f.armazenamento = 'medio';

      // ilha
      if (/ilha/.test(t)) f.ilha = !/(sem|nao quero|nao|retir|remov|tir[ae]|elimin)\w*\s*(a |uma )?ilha/.test(t);
      else if (campoAtual === 'ilha') {
        if (SIM.test(t)) f.ilha = true;
        else if (NAO.test(t)) f.ilha = false;
      }

      // pessoas
      const intervalo = t.match(/(\d+)\s*(?:a|ou|-)\s*(\d+)\s*(pessoas|lugares)?/);
      const pessoas = t.match(/(\d+)\s*(pessoas|lugares)/) || (campoAtual === 'pessoas' ? t.match(/(\d+)/) : null);
      if (intervalo && (intervalo[3] || campoAtual === 'pessoas')) f.pessoas = Number(intervalo[2]);
      else if (pessoas) f.pessoas = Number(pessoas[1]);

      // quantidade de módulos inferiores
      const inf = t.match(/(\d+)\s*(modulos?|armarios?)\s*(inferiores|de baixo|baixos)/);
      if (inf) f.qtdInferiores = Number(inf[1]);
      if (/sem bancada/.test(t)) f.bancada = false;
      else if (/bancada/.test(t) && !/(sem|retir|tir)\w* (a )?bancada/.test(t)) f.bancada = true;
    }

    // --- ROUPEIRO
    if (tipoFinal === 'roupeiro' || tipoFinal === 'quarto') {
      if (/(correr|deslizant)/.test(t)) f.tipoPorta = 'correr';
      else if (/(de abrir|batente|abrir)/.test(t)) f.tipoPorta = 'abrir';
      else if (/(sem portas|aberto|closet aberto)/.test(t) || (campoAtual === 'tipoPorta' && NAO.test(t))) f.tipoPorta = 'nenhuma';

      const portas = quantidade(t, 'portas?') ?? (campoAtual === 'portas' ? (t.match(/(\d+)/) || [])[1] : null);
      if (portas) f.portas = Number(portas);
      const gav = quantidade(t, 'gavetas?') ?? (campoAtual === 'gavetas' ? (t.match(/(\d+)/) || [])[1] : null);
      if (gav !== null && gav !== undefined) f.gavetas = Number(gav);
      if (campoAtual === 'gavetas' && NAO.test(t)) f.gavetas = 0;
      const var_ = quantidade(t, 'varoes|varao|cabideiros?');
      if (var_) f.varoes = Number(var_);
      const prat = quantidade(t, 'prateleiras?');
      if (prat) f.prateleiras = Number(prat);

      if (/(muita roupa|muito espaco para (roupa|cabides|pendurar)|muitos cabides|muita coisa para pendurar|muit[oa]s? (vestidos|casacos|camisas))/.test(t) || (campoAtual === 'roupa' && /muit/.test(t))) f.roupa = 'muita';
      else if (/(pouca roupa)/.test(t) || (campoAtual === 'roupa' && /pouc/.test(t))) f.roupa = 'pouca';
      else if (campoAtual === 'roupa' && /(medi|normal|razoavel)/.test(t)) f.roupa = 'media';

      const bool = (campo, re) => {
        if (re.test(t)) f[campo] = !new RegExp('(sem|nao quero|nao preciso|nao|dispenso|retir\\w*|tir\\w*)\\s+(de |o |a |um |uma )?(\\w+\\s)?' + re.source).test(t);
        else if (campoAtual === campo) {
          if (SIM.test(t)) f[campo] = true;
          else if (NAO.test(t)) f[campo] = false;
        }
      };
      bool('sapatos', /(sapat|calcado|tenis)/);
      bool('maleiro', /(mala|maleiro|bagagem|edredo)/);
      bool('led', /(\bled\b|iluminac|\bluz\b|luzes)/);
      bool('espelho', /espelho/);
    }

    // --- preferências especiais / pilar
    if (/(pilar|coluna estrutural|viga)/.test(t)) f.observacao = texto.trim();
    if (campoAtual === 'especiais' && !NAO.test(t) && !PULAR.test(t) && !Object.keys(f).length) f.observacao = texto.trim();

    return f;
  }

  // ---------------------------------------------------------------
  // Factos → comandos
  // ---------------------------------------------------------------
  const CAMPOS_LAYOUT = ['largura', 'profundidade', 'altura', 'ateTeto', 'formato', 'janela', 'porta', 'agua', 'placa', 'eletrodomesticos', 'armazenamento', 'ilha', 'qtdInferiores', 'tipoPorta', 'portas', 'roupa', 'gavetas', 'varoes', 'prateleiras', 'sapatos', 'maleiro', 'led', 'espelho', 'profundidadeMovel', 'pessoas'];
  const PREF_DIRETAS = ['formato', 'armazenamento', 'placa', 'qtdInferiores', 'tipoPorta', 'portas', 'roupa', 'gavetas', 'varoes', 'prateleiras', 'sapatos', 'maleiro', 'led', 'espelho', 'profundidadeMovel', 'pessoas', 'bancada'];

  function fatosParaComandos(f, projeto, modoEdicao) {
    const cmds = [];
    const respondidos = [];
    const manual = projeto.layoutManual;
    let regenerar = false;

    if (f.tipo) {
      cmds.push({ action: 'set_room_type', tipo: f.tipo, gerar: false });
      respondidos.push('tipo');
      regenerar = true;
    }
    const dims = {};
    ['largura', 'profundidade', 'altura'].forEach((k) => {
      if (f[k] !== undefined) {
        dims[k] = f[k];
        respondidos.push(k);
      }
    });
    if (Object.keys(dims).length) cmds.push(Object.assign({ action: 'set_room_dimensions', gerar: false }, dims));

    if (f.ateTeto !== undefined) {
      if (modoEdicao || manual) cmds.push({ action: 'set_full_height', valor: f.ateTeto });
      else cmds.push({ action: 'set_preference', chave: 'ateTeto', valor: f.ateTeto });
      respondidos.push('ateTeto');
    }

    PREF_DIRETAS.forEach((k) => {
      if (f[k] === undefined) return;
      cmds.push({ action: 'set_preference', chave: k, valor: f[k] });
      respondidos.push(k);
      if (k === 'pessoas' && f.pessoas >= 4 && !projeto.conversa.respondidos.armazenamento && f.armazenamento === undefined) {
        cmds.push({ action: 'set_preference', chave: 'armazenamento', valor: 'alto' });
      }
    });

    if (f.janela !== undefined) {
      cmds.push({ action: 'set_window', posicao: f.janela === 'nenhuma' ? null : f.janela });
      if (f.janela !== 'nenhuma' && !projeto.conversa.respondidos.agua && f.agua === undefined) cmds.push({ action: 'set_preference', chave: 'posicaoPia', valor: 'janela' });
      respondidos.push('janela');
    }
    if (f.porta !== undefined) {
      cmds.push({ action: 'set_entry_door', parede: f.porta });
      respondidos.push('porta');
    }
    if (f.agua !== undefined) {
      cmds.push({ action: 'set_preference', chave: 'posicaoPia', valor: f.agua });
      respondidos.push('agua');
    }
    if (f.eletrodomesticos !== undefined) {
      cmds.push({ action: 'set_appliances', lista: f.eletrodomesticos });
      respondidos.push('eletrodomesticos');
    }

    if (f.ilha !== undefined) {
      if (modoEdicao || manual) cmds.push({ action: f.ilha ? 'add_island' : 'remove_island' });
      else cmds.push({ action: 'set_preference', chave: 'ilha', valor: f.ilha });
      respondidos.push('ilha');
    }

    // Com o projeto já editado, alterações de roupeiro aplicam-se aos módulos
    if (modoEdicao || manual) {
      if (f.tipoPorta !== undefined) cmds.push({ action: 'set_door_type', tipoPorta: f.tipoPorta });
      ['led', 'espelho', 'maleiro'].forEach((k) => {
        if (f[k] !== undefined) cmds.push({ action: 'toggle_component', componente: k, valor: f[k], todos: true });
      });
      if (f.sapatos !== undefined) cmds.push({ action: 'toggle_component', componente: 'sapateira', valor: f.sapatos, id: 'auto' });
    }

    if (f.estilo) { cmds.push({ action: 'change_style', estilo: f.estilo }); respondidos.push('estilo'); }
    if (f.material) { cmds.push({ action: 'change_material', material: f.material }); respondidos.push('material'); }
    if (f.acabamento) { cmds.push({ action: 'change_finish', acabamento: f.acabamento }); respondidos.push('acabamento'); }
    if (f.observacao) { cmds.push({ action: 'set_notes', texto: f.observacao }); respondidos.push('especiais'); }

    // Eletrodomésticos mencionados em frases livres
    (f.eletroAdd || []).forEach((k) => {
      if (modoEdicao || manual) cmds.push({ action: 'add_appliance', aparelho: k });
      else if (!projeto.eletrodomesticos.includes(k)) cmds.push({ action: 'set_appliances', lista: projeto.eletrodomesticos.concat([k]) });
    });
    (f.eletroRem || []).forEach((k) => {
      if (modoEdicao || manual) cmds.push({ action: 'remove_appliance', aparelho: k });
      else cmds.push({ action: 'set_appliances', lista: projeto.eletrodomesticos.filter((e) => e !== k) });
    });

    if (respondidos.some((k) => CAMPOS_LAYOUT.includes(k)) || (f.eletroAdd || []).length || (f.eletroRem || []).length) regenerar = true;

    const aplicadasDireto = ['add_island', 'remove_island', 'add_appliance', 'remove_appliance', 'set_full_height', 'set_door_type', 'toggle_component'];
    let precisaReorganizar = false;
    if (regenerar && !manual && (!modoEdicao || !cmds.some((c) => aplicadasDireto.includes(c.action)))) {
      cmds.push({ action: 'generate_layout' });
    } else {
      // layout manual: as medidas ajustam sem reorganizar
      cmds.forEach((c) => { if (c.action === 'set_room_dimensions') delete c.gerar; });
      const soPreferencia = respondidos.filter((k) => ['formato', 'janela', 'porta', 'agua', 'placa', 'armazenamento', 'roupa', 'gavetas', 'varoes', 'prateleiras', 'portas', 'qtdInferiores', 'eletrodomesticos'].includes(k));
      precisaReorganizar = manual && soPreferencia.length > 0;
    }

    if (respondidos.length) cmds.push({ action: 'update_conversation', respondidos });
    return { cmds, respondidos, precisaReorganizar };
  }

  // ---------------------------------------------------------------
  // Intenções de edição (projeto já existente)
  // ---------------------------------------------------------------
  const ADD = /\b(adicion\w*|acrescent\w*|coloc\w*|ponh\w*|poe|por|pon\w*|inclu\w*|insir\w*|cri[ae]\w*|bot[ae]\w*|mete\w*|mais|quero mais|aument\w*)\b/;
  const REM = /\b(retir\w*|remov\w*|tir[ae]\w*|tira|elimin\w*|apag\w*|exclu\w*|menos|sem|diminu\w*|reduz\w*|nao quero)\b/;
  const AQUI = /\b(aqui|esse|essa|este|esta|neste|nesta|nesse|nessa|deste|desta|desse|dessa|selecionad\w*|nele|nela)\b/;

  function extrairIntencoes(texto, projeto) {
    const t = normalizar(texto);
    const cmds = [];
    const ui = [];
    let resposta = null;
    const alvo = AQUI.test(t) ? 'selecionado' : 'auto';

    if (/(recomec|reinici|comecar de novo|do zero|resetar|\breset\b|apagar tudo|limpar tudo|novo projeto)/.test(t)) {
      return { cmds: [{ action: 'reset_project', tipo: /roupeiro|closet/.test(t) ? 'roupeiro' : projeto.tipo }], ui: ['reiniciar_conversa'], resposta: null };
    }
    if (/(reorganiz|gerar de novo|gera de novo|refaz\w* (o )?(layout|projeto)|regener)/.test(t)) {
      return { cmds: [{ action: 'generate_layout' }], ui: ['enquadrar'], resposta: null };
    }

    // abrir / fechar frentes (vista)
    if (/\b(abr[ae]\w*|abrir|mostr\w* o interior|ver (o )?interior)\b/.test(t) && /(porta|gaveta|tudo|interior|roupeiro|armario|moveis)/.test(t)) {
      ui.push(/gaveta/.test(t) && !/porta/.test(t) ? 'abrir_gavetas' : 'abrir_tudo');
      return { cmds, ui, resposta: 'Abri as frentes para ver o interior. Faça duplo clique numa porta ou gaveta para a abrir ou fechar individualmente.' };
    }
    if (/\bfech\w*\b/.test(t) && /(porta|gaveta|tudo|roupeiro|armario)/.test(t)) {
      ui.push('fechar_tudo');
      return { cmds, ui, resposta: 'Fechei todas as portas e gavetas.' };
    }

    // frigorífico do outro lado
    if (/(frigorifico|geladeira|geleira)[^.]*(outro lado|lado oposto|trocar de lado|mudar de lado|inverter|ao contrario)|(outro lado|lado oposto)[^.]*(frigorifico|geladeira|geleira)|(invert|espelh)\w* (a |o )?(cozinha|layout|projeto)/.test(t)) {
      cmds.push({ action: 'swap_fridge_side' });
      return { cmds, ui, resposta };
    }

    // tipo de porta do roupeiro
    if ((projeto.tipo === 'roupeiro' || projeto.tipo === 'quarto') && /(portas? de correr|deslizant|portas? de abrir|batente|sem portas|roupeiro aberto)/.test(t)) {
      const tipo = /(correr|deslizant)/.test(t) ? 'correr' : /(sem portas|aberto)/.test(t) ? 'nenhuma' : 'abrir';
      cmds.push({ action: 'set_door_type', tipoPorta: tipo });
      return { cmds, ui, resposta };
    }

    // ilha
    if (/ilha/.test(t)) {
      cmds.push({ action: REM.test(t) ? 'remove_island' : 'add_island' });
      return { cmds, ui, resposta };
    }

    // até ao teto / altura
    if (/ate (a|ao|o) (teto|tecto)/.test(t)) {
      cmds.push({ action: 'set_full_height', valor: !/(nao|sem|retir)\w* ate/.test(t) });
      return { cmds, ui, resposta };
    }
    const alvoAltura = alvo === 'selecionado' ? 'selecionado' : projeto.tipo === 'roupeiro' && /(roupeiro|closet|armario|moveis|tudo)/.test(t) ? 'roupeiro' : /(armarios|moveis|colunas)/.test(t) ? 'altos' : projeto.selecionado ? 'selecionado' : projeto.tipo === 'roupeiro' ? 'roupeiro' : 'altos';
    if (/(mais alt[oa]s?|aument\w* a altura|subir|mais alto)/.test(t)) {
      cmds.push({ action: 'adjust_height', delta: 20, alvo: alvoAltura });
      return { cmds, ui, resposta };
    }
    if (/(mais baix[oa]s?|diminu\w* a altura|reduz\w* a altura|baixar)/.test(t)) {
      cmds.push({ action: 'adjust_height', delta: -20, alvo: alvoAltura });
      return { cmds, ui, resposta };
    }

    // largura / medidas do módulo selecionado
    const mencionaAmbiente = /(sala|cozinha|espaco|parede|ambiente|quarto|divisao|teto|pe direito)/.test(t);
    if (projeto.selecionado && !mencionaAmbiente) {
      if (/(mais larg[oa]|alarg\w*)/.test(t)) { cmds.push({ action: 'resize_module', id: 'selecionado', dLargura: 10 }); return { cmds, ui, resposta }; }
      if (/(mais estreit[oa]|estreit\w*)/.test(t)) { cmds.push({ action: 'resize_module', id: 'selecionado', dLargura: -10 }); return { cmds, ui, resposta }; }
      const medidas = extrairMedidas(t, null).filter((m) => m.papel);
      const sel = projeto.modulos.find((m) => m.id === projeto.selecionado);
      const lim = sel ? C.limites(sel) : null;
      const plausivel = (m) => {
        if (!lim) return false;
        const chave = { largura: 'larguraMax', altura: 'alturaMax', profundidade: 'profundidadeMax' }[m.papel];
        return m.cm <= lim[chave] * 1.5;
      };
      // "a profundidade é 3,4 m" com um módulo selecionado refere-se ao ambiente, não ao módulo
      if (medidas.length && medidas.every(plausivel) && /(largura|altura|profundidade)/.test(t) && !/(parede)/.test(t)) {
        const c = { action: 'resize_module', id: 'selecionado' };
        medidas.forEach((m) => { c[m.papel] = m.cm; });
        cmds.push(c);
        return { cmds, ui, resposta };
      }
    }

    // mover
    const mov = t.match(/\b(mov\w*|mex\w*|desloc\w*|empurr\w*|pass\w*|arrast\w*|chega\w*|encost\w*)\b[^.]*\b(esquerd\w*|direit\w*|frente|tras|fundo)/);
    if (mov) {
      const m = extrairMedidas(t, null)[0];
      const d = m ? m.cm : 20;
      const dir = mov[2];
      const c = { action: 'move_module', id: 'selecionado' };
      if (/esquerd/.test(dir)) c.dx = -d;
      else if (/direit/.test(dir)) c.dx = d;
      else if (/frente/.test(dir)) c.dz = -d;
      else c.dz = d;
      cmds.push(c);
      return { cmds, ui, resposta };
    }
    if (/\b(gira|gire|girar|rode|rodar|roda|vira|vire|virar)\b/.test(t)) {
      cmds.push({ action: 'rotate_module', id: 'selecionado', graus: 90 });
      return { cmds, ui, resposta };
    }
    if (/\b(duplic\w*|copi\w*|clon\w*)\b/.test(t)) {
      cmds.push({ action: 'duplicate_module', id: 'selecionado' });
      return { cmds, ui, resposta };
    }

    // eletrodomésticos
    if (projeto.tipo === 'cozinha') {
      const eletro = extrairEletro(t);
      if (eletro.length && (ADD.test(t) || REM.test(t) || /\bquero\b/.test(t))) {
        eletro.forEach((e) => cmds.push({ action: e.negado || (REM.test(t) && !ADD.test(t)) ? 'remove_appliance' : 'add_appliance', aparelho: e.k }));
        return { cmds, ui, resposta };
      }
    }

    // componentes
    const qtd = (palavra) => {
      const m = t.match(new RegExp('(\\d+)\\s*(?:\\w+\\s)?(' + palavra + ')'));
      return m ? Number(m[1]) : null;
    };
    const remover = REM.test(t) && !/\bmais\b/.test(t);
    const componentes = [
      ['gaveta', /gavet/, 'gavetas?'],
      ['prateleira', /prateleir/, 'prateleiras?'],
      ['varao', /(varao|varoes|cabide|cabides|pendurar|cabideiro)/, 'varoes|varao|cabides|cabideiros?'],
      ['porta', /\bportas?\b/, 'portas?']
    ];
    for (const [comp, re, plural] of componentes) {
      if (!re.test(t)) continue;
      if (comp === 'porta' && !projeto.selecionado && !/(armario|modulo|roupeiro)/.test(t)) continue;
      const n = qtd(plural);
      const sufixo = { gaveta: 'drawer', prateleira: 'shelf', varao: 'rod', porta: 'door' }[comp];
      if (n !== null && !/\bmais\b|\bmenos\b/.test(t) && /\b(quero|com|ter|tenha|fique|ficar|deixe|so)\b/.test(t) && comp !== 'porta' && comp !== 'varao') {
        cmds.push({ action: comp === 'gaveta' ? 'set_drawers' : 'set_shelves', id: alvo, quantidade: n });
      } else {
        cmds.push({ action: (remover ? 'remove_' : 'add_') + sufixo, id: alvo, quantidade: n || (comp === 'gaveta' && /gavetas/.test(t) && !remover ? 2 : 1) });
      }
      return { cmds, ui, resposta };
    }
    const toggles = [['led', /(\bled\b|iluminac|\bluz\b|luzes)/], ['espelho', /espelho/], ['sapateira', /(sapateira|sapatos)/], ['maleiro', /(maleiro|malas)/]];
    for (const [comp, re] of toggles) {
      if (!re.test(t) || !(ADD.test(t) || REM.test(t) || /\bquero\b/.test(t))) continue;
      const todos = alvo !== 'selecionado' && (comp === 'led' || /(todos|todo o|tudo)/.test(t));
      cmds.push({ action: 'toggle_component', componente: comp, id: alvo, valor: !remover, todos });
      return { cmds, ui, resposta };
    }

    // módulos
    const nModulos = (t.match(/(\d+)\s*(modulos?|armarios?|colunas?|gaveteiros?)/) || [])[1];
    if (REM.test(t) && /(modulo|armario|movel|isto|isso|este|esse|coluna|gaveteiro)/.test(t) && (AQUI.test(t) || projeto.selecionado)) {
      cmds.push({ action: 'remove_module', id: 'selecionado' });
      return { cmds, ui, resposta };
    }
    if ((ADD.test(t) || /\bquero\b/.test(t)) && /(modulo|armario|gaveteiro|coluna|despenseiro|estante|seccao|secao|nicho)/.test(t)) {
      let id = null;
      if (projeto.tipo === 'cozinha') {
        if (/(gaveteiro|modulo de gavetas|com gavetas)/.test(t)) id = 'gaveteiro-60';
        else if (/(superior|de cima|suspens|parede alta)/.test(t)) id = 'superior-60';
        else if (/coluna/.test(t) && /(eletro|forno|micro)/.test(t)) id = 'coluna-forno-60';
        else if (/(coluna|despenseiro|alto)/.test(t)) id = 'coluna-60';
        else id = 'inferior-60';
      } else if (projeto.tipo === 'roupeiro' || projeto.tipo === 'quarto') {
        if (/gaveta/.test(t)) id = 'roupeiro-gavetas-90';
        else if (/sapat/.test(t)) id = 'roupeiro-sapateira-60';
        else if (/prateleira/.test(t)) id = 'roupeiro-prateleiras-60';
        else id = 'roupeiro-cabides-90';
      } else {
        id = (C.listarPorAmbiente(projeto.tipo)[0] || C.getModulo('bloco-60')).id;
      }
      const n = Math.min(4, Number(nModulos) || 1);
      for (let i = 0; i < n; i += 1) cmds.push({ action: 'add_module', catalogoId: id });
      return { cmds, ui: ['enquadrar'], resposta };
    }

    // perguntas informativas
    if (/(quanto (custa|fica|vai ficar|sai)|preco|orcamento|valor|custo)/.test(t)) {
      const orc = global.NovariProject.calcularOrcamento(projeto);
      resposta = `O valor aproximado do projeto atual é ${C.formatarMoeda(orc.total)}. É uma estimativa indicativa, não o orçamento final da Novari — esse é feito após medição no local.`;
      return { cmds, ui, resposta };
    }
    if (/(sugest|sugere|recomend|o que acha|conselho|dica|melhorar|analis)/.test(t)) {
      resposta = analisarProjeto(projeto).join(' ') || 'O projeto está equilibrado. Pode experimentar outro acabamento ou pedir mais armazenamento.';
      return { cmds, ui, resposta };
    }
    if (/(ajuda|o que (posso|consigo)|exemplos|como funciona|comandos)/.test(t)) {
      resposta = exemplosEdicao(projeto);
      return { cmds, ui, resposta };
    }
    return { cmds, ui, resposta };
  }

  // Análise do projeto a partir do estado (sem respostas aleatórias)
  function analisarProjeto(p) {
    const dicas = [];
    const gavetas = p.modulos.reduce((s, m) => s + (m.componentes.gavetas || 0), 0);
    if (p.tipo === 'cozinha') {
      const pia = p.modulos.find((m) => m.tipo === 'pia');
      const placa = p.modulos.find((m) => m.componentes.placa);
      if (pia && placa) {
        const entre = Math.abs(pia.posicao.x - placa.posicao.x) - (pia.dimensoes.largura + placa.dimensoes.largura) / 2;
        if (entre < 40) dicas.push(`Há apenas ${Math.max(0, Math.round(entre))} cm de bancada entre a pia e a placa; o ideal são pelo menos 60 cm para preparar alimentos.`);
      }
      if ((p.preferencias.pessoas || 0) >= 4 && gavetas < 6) dicas.push(`Para ${p.preferencias.pessoas} pessoas recomendo pelo menos 6 gavetas (tem ${gavetas}). Diga "coloque mais duas gavetas".`);
      if (!p.modulos.some((m) => m.tipo === 'ilha') && p.espaco.profundidade >= 280) dicas.push('A profundidade permite uma ilha — diga "adicione uma ilha" se quiser experimentar.');
      if (!p.preferencias.ateTeto && p.espaco.altura >= 260) dicas.push('Levar os armários até ao teto aumenta o armazenamento e evita acumular pó em cima.');
    }
    if (p.tipo === 'roupeiro') {
      const varoes = p.modulos.reduce((s, m) => s + (m.componentes.varoes || 0), 0);
      if (varoes === 0) dicas.push('O roupeiro não tem varões; se pendura camisas ou vestidos, peça "mais espaço para cabides".');
      if (!p.modulos.some((m) => m.componentes.led)) dicas.push('A iluminação LED interior ajuda a encontrar a roupa — basta pedir "adicione LED".');
      if (!p.preferencias.ateTeto && p.espaco.altura - (p.modulos[0] ? p.modulos[0].dimensoes.altura : 0) > 15) dicas.push('Pode aproveitar a altura total pedindo "roupeiro até ao teto".');
    }
    return dicas.slice(0, 2);
  }

  function exemplosEdicao(p) {
    if (p.tipo === 'roupeiro') return 'Pode pedir, por exemplo: "coloque mais duas gavetas", "quero mais espaço para cabides", "retire essa prateleira", "faça o roupeiro mais alto", "portas de correr", "troque o acabamento para branco" ou "adicione LED". Clique num módulo para o selecionar e use "aqui" para se referir a ele.';
    return 'Pode pedir, por exemplo: "coloque mais duas gavetas", "adicione uma ilha", "coloque o frigorífico do outro lado", "faça os armários até ao teto", "troque o acabamento para nogueira", "retire a máquina de loiça" ou "quero três gavetas aqui" (com um módulo selecionado).';
  }

  // ---------------------------------------------------------------
  // Roteiro da conversa
  // ---------------------------------------------------------------
  const ROTEIRO = {
    cozinha: ['tipo', 'largura', 'profundidade', 'altura', 'formato', 'janela', 'porta', 'agua', 'placa', 'eletrodomesticos', 'armazenamento', 'ilha', 'pessoas', 'estilo', 'material', 'acabamento', 'especiais'],
    roupeiro: ['tipo', 'largura', 'altura', 'ateTeto', 'profundidadeMovel', 'tipoPorta', 'portas', 'roupa', 'gavetas', 'sapatos', 'maleiro', 'led', 'espelho', 'estilo', 'material', 'acabamento', 'especiais'],
    outro: ['tipo', 'largura', 'profundidade', 'altura', 'estilo', 'acabamento']
  };

  const m2 = (cm) => (cm / 100).toFixed(2).replace('.', ',') + ' m';

  const PERGUNTAS = {
    tipo: { texto: () => 'Você pretende planejar uma cozinha ou um roupeiro?', opcoes: () => ['Cozinha', 'Roupeiro'] },
    largura: {
      texto: (p) => (p.tipo === 'roupeiro' ? 'Qual é a largura disponível para o roupeiro?' : 'Qual é a largura aproximada da parede principal da cozinha?'),
      dica: 'Pode escrever, por exemplo, "3,60 metros" ou "360 cm".',
      opcoes: (p) => (p.tipo === 'roupeiro' ? ['2 m', '2,4 m', '2,8 m'] : ['2,4 m', '3 m', '3,6 m'])
    },
    profundidade: { texto: () => 'E a profundidade do espaço, da parede principal até à parede oposta?', opcoes: () => ['2 m', '2,5 m', '3 m'] },
    altura: { texto: () => 'Qual é a altura do teto? Se não souber, considero 2,70 m.', opcoes: () => ['2,50 m', '2,70 m', 'Não sei'] },
    ateTeto: { texto: () => 'Quer o roupeiro até ao teto? Ganha espaço de arrumação e fica sem pó em cima.', opcoes: () => ['Sim, até ao teto', 'Não'] },
    profundidadeMovel: { texto: () => 'Que profundidade tem disponível para o roupeiro? O habitual são 60 cm.', opcoes: () => ['55 cm', '60 cm', '65 cm'] },
    formato: { texto: () => 'Os móveis ficam numa só parede ou em L, aproveitando também uma parede lateral?', opcoes: () => ['Uma parede (linear)', 'Em L'] },
    janela: { texto: () => 'Há alguma janela na parede principal? Onde fica?', opcoes: () => ['Não há janela', 'À esquerda', 'No meio', 'À direita'] },
    porta: { texto: () => 'Onde fica a porta de entrada da cozinha?', opcoes: () => ['Parede esquerda', 'Parede direita', 'Em frente'] },
    agua: {
      texto: () => 'Onde fica o ponto de água, ou seja, onde prefere a pia?',
      opcoes: (p) => (p.janelas.length ? ['Debaixo da janela', 'À esquerda', 'Ao centro', 'À direita'] : ['À esquerda', 'Ao centro', 'À direita'])
    },
    placa: { texto: () => 'A placa será de indução, a gás ou vitrocerâmica?', opcoes: () => ['Indução', 'Gás', 'Vitrocerâmica'] },
    eletrodomesticos: { texto: () => 'Que eletrodomésticos quer integrar nos móveis?', opcoes: () => ['Frigorífico, forno e máquina de loiça', 'Frigorífico e forno', 'Todos, com micro-ondas'] },
    armazenamento: { texto: () => 'Quanto armazenamento precisa?', opcoes: () => ['Pouco', 'Médio', 'Muito'] },
    ilha: {
      aplicavel: (p) => p.espaco.profundidade >= 268,
      texto: (p) => `Com ${m2(p.espaco.profundidade)} de profundidade cabe uma ilha. Gostaria de ter uma?`,
      opcoes: () => ['Sim', 'Não']
    },
    pessoas: { texto: () => 'Quantas pessoas usam a cozinha no dia a dia?', opcoes: () => ['1 a 2', '3 a 4', '5 ou mais'] },
    tipoPorta: { texto: () => 'Prefere portas de abrir ou de correr?', opcoes: () => ['De abrir', 'De correr', 'Sem portas'] },
    portas: {
      aplicavel: (p) => p.preferencias.tipoPorta !== 'nenhuma',
      texto: (p) => {
        const s = global.NovariProject.sugestaoPortasRoupeiro(p.espaco.largura, p.preferencias.tipoPorta);
        return `Quantas portas? Para ${p.espaco.largura} cm sugiro ${s}.`;
      },
      opcoes: (p) => {
        const s = global.NovariProject.sugestaoPortasRoupeiro(p.espaco.largura, p.preferencias.tipoPorta);
        return [Math.max(1, s - 1), s, s + 1].map((n) => `${n} portas`);
      }
    },
    roupa: { texto: () => 'Quanta roupa costuma pendurar (camisas, vestidos, casacos)?', opcoes: () => ['Muita', 'Média', 'Pouca'] },
    gavetas: { texto: () => 'Quantas gavetas gostaria?', opcoes: () => ['Nenhuma', '4 gavetas', '6 gavetas', '8 gavetas'] },
    sapatos: { texto: () => 'Precisa de espaço para sapatos?', opcoes: () => ['Sim', 'Não'] },
    maleiro: { texto: () => 'Quer um maleiro em cima, para malas e edredões?', opcoes: () => ['Sim', 'Não'] },
    led: { texto: () => 'Quer iluminação LED no interior?', opcoes: () => ['Sim', 'Não'] },
    espelho: { aplicavel: (p) => p.preferencias.tipoPorta !== 'nenhuma', texto: () => 'Deseja espelho numa das portas?', opcoes: () => ['Sim', 'Não'] },
    estilo: { texto: () => 'Que estilo prefere?', opcoes: () => ['Moderno', 'Minimalista', 'Clássico', 'Industrial'] },
    material: { texto: () => 'Que material prefere para a estrutura?', opcoes: () => ['MDF', 'Madeira maciça', 'Compensado'] },
    acabamento: { texto: () => 'E o acabamento?', opcoes: () => ['Carvalho', 'Branco', 'Preto', 'Cinza', 'Nogueira'] },
    especiais: { texto: () => 'Por último: há alguma preferência especial — um pilar, tomadas extra ou algo a evitar?', opcoes: () => ['Não, está tudo', 'Há um pilar'] }
  };

  // Valores assumidos quando o cliente não sabe / pede sugestão
  function padraoPara(campo, p) {
    const s = global.NovariProject.sugestaoPortasRoupeiro(p.espaco.largura, p.preferencias.tipoPorta);
    const tabela = {
      tipo: { tipo: 'cozinha' },
      largura: { largura: p.tipo === 'roupeiro' ? 240 : 320 },
      profundidade: { profundidade: p.tipo === 'roupeiro' ? 300 : 250 },
      altura: { altura: 270 },
      ateTeto: { ateTeto: true },
      profundidadeMovel: { profundidadeMovel: 60 },
      formato: { formato: 'linear' },
      janela: { janela: 'nenhuma' },
      porta: { porta: 'frente' },
      agua: { agua: p.janelas.length ? 'janela' : 'centro' },
      placa: { placa: 'inducao' },
      eletrodomesticos: { eletrodomesticos: global.NovariProject.ELETRO_PADRAO.slice() },
      armazenamento: { armazenamento: 'medio' },
      ilha: { ilha: false },
      pessoas: {},
      tipoPorta: { tipoPorta: 'abrir' },
      portas: { portas: s },
      roupa: { roupa: 'media' },
      gavetas: { gavetas: 4 },
      sapatos: { sapatos: false },
      maleiro: { maleiro: true },
      led: { led: false },
      espelho: { espelho: false },
      estilo: { estilo: 'moderno' },
      material: { material: 'MDF' },
      acabamento: { acabamento: p.acabamento || 'Carvalho' },
      especiais: {}
    };
    return tabela[campo] || {};
  }

  function roteiroDe(p) {
    return ROTEIRO[p.tipo] || ROTEIRO.outro;
  }

  function proximaPergunta(p) {
    const conv = p.conversa;
    if (conv.concluida) return null;
    for (const campo of roteiroDe(p)) {
      if (conv.respondidos[campo]) continue;
      const q = PERGUNTAS[campo];
      if (!q) continue;
      if (q.aplicavel && !q.aplicavel(p)) continue;
      return { campo, texto: q.texto(p), opcoes: q.opcoes ? q.opcoes(p) : null, dica: q.dica || null };
    }
    return null;
  }

  // ---------------------------------------------------------------
  // Descrição do que foi entendido
  // ---------------------------------------------------------------
  const ROTULOS = {
    tipo: (v) => (v === 'roupeiro' ? 'roupeiro' : v === 'cozinha' ? 'cozinha' : C.AMBIENTES[v] || v),
    largura: (v) => `largura ${v} cm`,
    profundidade: (v) => `profundidade ${v} cm`,
    altura: (v) => `altura ${v} cm`,
    ateTeto: (v) => (v ? 'até ao teto' : 'sem ir até ao teto'),
    profundidadeMovel: (v) => `profundidade do roupeiro ${v} cm`,
    formato: (v) => (v === 'L' ? 'formato em L' : 'formato linear'),
    janela: (v) => (v === 'nenhuma' ? 'sem janela' : `janela ${v === 'centro' ? 'ao centro' : 'à ' + v}`),
    porta: (v) => (v === 'frente' ? 'porta de entrada em frente' : `porta de entrada na parede ${v}`),
    agua: (v) => (v === 'janela' ? 'pia debaixo da janela' : `pia ${v === 'centro' ? 'ao centro' : 'à ' + v}`),
    placa: (v) => ({ gas: 'placa a gás', inducao: 'placa de indução', vitro: 'placa vitrocerâmica' }[v]),
    eletrodomesticos: (v) => (v.length ? 'eletrodomésticos: ' + v.map((k) => C.ELETRODOMESTICOS[k].toLowerCase()).join(', ') : 'sem eletrodomésticos integrados'),
    armazenamento: (v) => `armazenamento ${{ alto: 'alto', medio: 'médio', baixo: 'reduzido' }[v]}`,
    ilha: (v) => (v ? 'com ilha' : 'sem ilha'),
    pessoas: (v) => `${v} pessoa${v === 1 ? '' : 's'}`,
    tipoPorta: (v) => ({ abrir: 'portas de abrir', correr: 'portas de correr', nenhuma: 'sem portas' }[v]),
    portas: (v) => `${v} portas`,
    roupa: (v) => `${v} roupa para pendurar`,
    gavetas: (v) => (v ? `${v} gavetas` : 'sem gavetas'),
    varoes: (v) => `${v} varões`,
    prateleiras: (v) => `${v} prateleiras`,
    sapatos: (v) => (v ? 'com sapateira' : 'sem sapateira'),
    maleiro: (v) => (v ? 'com maleiro' : 'sem maleiro'),
    led: (v) => (v ? 'com LED' : 'sem LED'),
    espelho: (v) => (v ? 'com espelho' : 'sem espelho'),
    estilo: (v) => `estilo ${C.ESTILOS[v].nome.toLowerCase()}`,
    material: (v) => C.MATERIAIS[v].nome,
    acabamento: (v) => `acabamento ${v}`,
    qtdInferiores: (v) => `${v} módulos inferiores`,
    observacao: () => 'preferência especial registada'
  };

  function descreverFatos(f) {
    return Object.keys(f)
      .filter((k) => ROTULOS[k] && f[k] !== undefined)
      .map((k) => ROTULOS[k](f[k]))
      .filter(Boolean);
  }

  // ---------------------------------------------------------------
  // 1) Integração com IA real (desativada até existir configuração)
  // ---------------------------------------------------------------
  /*
    Contrato esperado do endpoint (POST JSON):
      pedido:   { mensagem, projeto, historico, comandosDisponiveis, perguntaAtual }
      resposta: { resposta: "texto para o cliente",
                  comandos: [ { action: "add_drawer", id: "modulo-004", quantidade: 2 }, ... ],
                  opcoes?: ["Sim", "Não"], concluida?: boolean }
    Configure com: window.NOVARI_AI_CONFIG = { endpoint: '/api/novari-ia', headers: {...} }
    (a chave de API deve ficar no servidor, nunca no navegador).
  */
  async function processarComIA(mensagem, projetoAtual) {
    const cfg = global.NOVARI_AI_CONFIG;
    if (!cfg || !cfg.endpoint) return null;
    const pergunta = proximaPergunta(projetoAtual);
    const resp = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, cfg.headers || {}),
      body: JSON.stringify({
        mensagem,
        projeto: global.NovariProject.resumoParaIA(projetoAtual),
        historico: projetoAtual.conversa.historico.slice(-12),
        perguntaAtual: pergunta ? pergunta.campo : null,
        comandosDisponiveis: global.NovariProject.comandosDisponiveis
      })
    });
    if (!resp.ok) throw new Error('IA respondeu HTTP ' + resp.status);
    const data = await resp.json();
    return {
      origem: 'api',
      resposta: String(data.resposta || ''),
      comandos: Array.isArray(data.comandos) ? data.comandos : [],
      opcoes: Array.isArray(data.opcoes) ? data.opcoes : null,
      concluida: !!data.concluida,
      ui: []
    };
  }

  function modoAtivo() {
    return global.NOVARI_AI_CONFIG && global.NOVARI_AI_CONFIG.endpoint ? 'api' : 'local';
  }

  // ---------------------------------------------------------------
  // 2) Interpretação local
  // ---------------------------------------------------------------
  function processarLocal(mensagem, projeto) {
    const t = normalizar(mensagem);
    const conv = projeto.conversa;
    const pergunta = proximaPergunta(projeto);
    const campoAtual = pergunta ? pergunta.campo : null;
    const emConversa = !conv.concluida;

    if (!emConversa) {
      // Uma descrição completa ("roupeiro de 280 cm, 4 portas, 8 gavetas…") redefine o projeto
      const fatosRicos = extrairFatos(mensagem, projeto, null);
      const chavesLayout = Object.keys(fatosRicos).filter((k) => CAMPOS_LAYOUT.includes(k) || k === 'tipo');
      if (chavesLayout.length >= 3) {
        const { cmds } = fatosParaComandos(fatosRicos, Object.assign({}, projeto, { layoutManual: false }), false);
        if (!cmds.some((c) => c.action === 'generate_layout')) cmds.push({ action: 'generate_layout' });
        return {
          origem: 'local',
          comandos: cmds,
          resposta: `Refiz o projeto com estas indicações: ${descreverFatos(fatosRicos).join(', ')}.`,
          ui: ['enquadrar'],
          fatos: fatosRicos
        };
      }
      // edição do projeto existente
      const intent = extrairIntencoes(mensagem, projeto);
      if (intent.cmds.length || intent.resposta || intent.ui.length) {
        return { origem: 'local', comandos: intent.cmds, resposta: intent.resposta, ui: intent.ui, fatos: {} };
      }
      const f = extrairFatos(mensagem, projeto, null);
      const { cmds, precisaReorganizar } = fatosParaComandos(f, projeto, true);
      if (cmds.length) {
        const resposta = precisaReorganizar
          ? `Anotei: ${descreverFatos(f).join(', ')}. Como o projeto já foi editado à mão, não reorganizei os módulos — diga "reorganizar" para eu refazer o layout com esta preferência.`
          : null;
        return { origem: 'local', comandos: cmds, resposta, ui: [], fatos: f };
      }
      return {
        origem: 'local',
        comandos: [],
        resposta: 'Não consegui transformar esse pedido numa alteração do projeto. ' + exemplosEdicao(projeto),
        ui: [],
        fatos: {}
      };
    }

    // conversa guiada
    let f = extrairFatos(mensagem, projeto, campoAtual);
    const saltar = campoAtual && PULAR.test(t) && f[campoAtual] === undefined;
    if (saltar) f = Object.assign(padraoPara(campoAtual, projeto), f);
    if (campoAtual === 'especiais' && (NAO.test(t) || PULAR.test(t)) && !f.observacao) f.especiaisOk = true;
    if (campoAtual === 'pessoas' && f.pessoas === undefined && /5 ou mais/.test(t)) f.pessoas = 5;

    let { cmds, respondidos } = fatosParaComandos(f, projeto, false);
    if (f.especiaisOk) {
      cmds.push({ action: 'update_conversation', respondidos: ['especiais'] });
      respondidos = respondidos.concat(['especiais']);
    }
    if (saltar && !respondidos.includes(campoAtual)) {
      cmds.push({ action: 'update_conversation', respondidos: [campoAtual] });
      respondidos.push(campoAtual);
    }

    if (!cmds.length) {
      // talvez seja um pedido de edição ou pergunta durante a conversa
      const intent = extrairIntencoes(mensagem, projeto);
      if (intent.cmds.length || intent.resposta || intent.ui.length) {
        return { origem: 'local', comandos: intent.cmds, resposta: intent.resposta, ui: intent.ui, fatos: {} };
      }
      return {
        origem: 'local',
        comandos: [],
        resposta: 'Não consegui identificar a resposta.' + (pergunta && pergunta.dica ? ' ' + pergunta.dica : ' Pode escolher uma das opções ou escrever "não sei" para eu sugerir.'),
        naoEntendido: true,
        ui: [],
        fatos: {}
      };
    }

    const partes = descreverFatos(f);
    let resposta = '';
    if (saltar) resposta = `Sem problema — assumi ${partes.join(', ') || 'um valor padrão'}.`;
    else if (partes.length) resposta = `${respondidos.length > 2 ? 'Ótimo, percebi várias coisas' : 'Perfeito'}: ${partes.join(', ')}.`;
    return { origem: 'local', comandos: cmds, resposta, ui: respondidos.includes('largura') || respondidos.includes('tipo') ? ['enquadrar'] : [], fatos: f };
  }

  // ---------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------
  async function processar(mensagem, projeto) {
    try {
      const r = await processarComIA(mensagem, projeto);
      if (r) return r;
    } catch (e) {
      console.warn('[Novari] IA externa indisponível, a usar o interpretador local:', e);
    }
    return processarLocal(mensagem, projeto);
  }

  // Avisos do gerador já comunicados (evita repetir a cada resposta)
  const avisosMostrados = new Set();

  // Compõe a mensagem final, depois de os comandos terem sido aplicados
  function compor(projeto, resultado, execucoes, totalAntes) {
    const partes = [];
    if (resultado.resposta) partes.push(resultado.resposta);
    const falhas = execucoes.filter((e) => !e.ok && e.mensagem).map((e) => e.mensagem);
    const mensagens = execucoes.filter((e) => e.ok && e.mensagem && !['update_conversation', 'set_preference', 'set_room_type', 'set_room_dimensions', 'chat_message', 'set_appliances', 'set_window', 'set_entry_door', 'change_style', 'change_material', 'change_finish', 'set_notes'].includes(e.action)).map((e) => e.mensagem);
    const conv = projeto.conversa;

    if (conv.concluida || resultado.origem === 'api') {
      // avisos do gerador já comunicados não se repetem
      const novas = mensagens.map((msg) => {
        const avisos = (projeto.avisos || []).filter((a) => msg.includes(a));
        if (!avisos.length) return msg;
        let limpa = msg;
        avisos.forEach((a) => {
          if (avisosMostrados.has(a)) limpa = limpa.replace(a, '').trim();
          avisosMostrados.add(a);
        });
        return limpa;
      }).filter(Boolean);
      partes.push(...novas, ...falhas);
      const acabamento = execucoes.find((e) => ['change_finish', 'change_material', 'change_style', 'set_room_dimensions'].includes(e.action) && e.ok && e.mensagem);
      if (acabamento && !partes.includes(acabamento.mensagem)) partes.push(acabamento.mensagem);
      const totalDepois = global.NovariProject.calcularOrcamento(projeto).total;
      if (execucoes.some((e) => e.ok && e.alteracoes.length) && Math.abs(totalDepois - totalAntes) > 1) {
        partes.push(`Valor aproximado: ${C.formatarMoeda(totalDepois)}.`);
      }
      return { texto: partes.join(' ') || 'Feito.', opcoes: resultado.opcoes || null };
    }

    // durante a conversa: avisos relevantes + próxima pergunta
    const gerou = execucoes.some((e) => e.action === 'generate_layout' || e.gerado);
    const avisos = (gerou ? projeto.avisos || [] : []).filter((a) => !avisosMostrados.has(a));
    avisos.forEach((a) => avisosMostrados.add(a));
    partes.push(...falhas, ...avisos.slice(0, 2));

    const proxima = proximaPergunta(projeto);
    if (proxima) {
      if (!resultado.naoEntendido) partes.push(proxima.texto);
      return { texto: partes.join(' '), opcoes: proxima.opcoes, campo: proxima.campo };
    }
    return { texto: partes.join(' '), opcoes: null, concluir: true };
  }

  function mensagemConclusao(projeto) {
    const n = projeto.modulos.length;
    const orc = global.NovariProject.calcularOrcamento(projeto);
    const tipo = projeto.tipo === 'roupeiro' ? 'O seu roupeiro está montado' : projeto.tipo === 'cozinha' ? 'A sua cozinha está montada' : 'O seu projeto está montado';
    return `${tipo}:${n} módulos, ${projeto.acabamento.toLowerCase()} em ${C.MATERIAIS[projeto.material].nome}, valor aproximado de ${C.formatarMoeda(orc.total)}. Clique num módulo para o editar, arraste para mover, ou peça-me alterações. ${exemplosEdicao(projeto)}`;
  }

  // "Gerar meu projeto": completa o que falta com valores sensatos
  function completarComPadroes(projeto) {
    const f = {};
    roteiroDe(projeto).forEach((campo) => {
      if (projeto.conversa.respondidos[campo]) return;
      Object.assign(f, padraoPara(campo, projeto));
    });
    ['tipo', 'largura', 'profundidade', 'altura', 'acabamento', 'material', 'estilo'].forEach((k) => {
      if (projeto.conversa.respondidos[k]) delete f[k];
    });
    const { cmds } = fatosParaComandos(f, projeto, false);
    if (!cmds.some((c) => c.action === 'generate_layout')) cmds.push({ action: 'generate_layout' });
    cmds.push({ action: 'update_conversation', respondidos: roteiroDe(projeto), concluida: true });
    cmds.push({ action: 'set_state', estado: 'projeto_gerado' });
    return cmds;
  }

  function mensagemInicial() {
    const modo = modoAtivo() === 'api' ? '' : ' (Assistente em modo local — pronto para ligar a uma IA externa.)';
    return {
      texto: `Olá! Vamos começar o seu projeto. Vou fazer uma pergunta de cada vez e montar tudo no 3D enquanto conversamos.${modo} Você pretende planejar uma cozinha ou um roupeiro?`,
      opcoes: ['Cozinha', 'Roupeiro']
    };
  }

  global.NovariAI = {
    processar,
    processarComIA,
    processarLocal,
    compor,
    proximaPergunta,
    mensagemConclusao,
    mensagemInicial,
    completarComPadroes,
    analisarProjeto,
    modoAtivo,
    reiniciar: () => avisosMostrados.clear(),
    // utilitários expostos para testes
    _interno: { normalizar, extrairMedidas, extrairFatos, extrairIntencoes, fatosParaComandos }
  };

  // Compatibilidade com o nome antigo
  global.NovariAIParser = global.NovariAI;
})(typeof window !== 'undefined' ? window : globalThis);
