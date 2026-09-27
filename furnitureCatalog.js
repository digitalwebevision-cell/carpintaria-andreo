/* ============================================================
   NOVARI — BIBLIOTECA DE MÓDULOS
   Todas as medidas em centímetros. Preços aproximados, apenas
   para o protótipo (nunca apresentados como orçamento final).
   ============================================================ */
(function (global) {
  'use strict';

  const AMBIENTES = {
    cozinha: 'Cozinha',
    roupeiro: 'Roupeiro / closet',
    sala: 'Sala',
    quarto: 'Quarto',
    escritorio: 'Escritório',
    outro: 'Outro ambiente'
  };

  // Acabamentos: cor base + veio (madeira) — usados pelo motor 3D para
  // gerar materiais procedurais. `textura` fica reservado para imagens reais.
  const ACABAMENTOS = {
    Carvalho: { nome: 'Carvalho', cor: '#c9a47c', veio: '#8e6440', madeira: true, brilho: 0.08, fator: 1.12, bancada: '#ebe7e0', textura: null },
    Branco: { nome: 'Branco', cor: '#f1eee9', madeira: false, brilho: 0.14, fator: 1.0, bancada: '#5b5753', textura: null },
    Preto: { nome: 'Preto', cor: '#2b2a28', madeira: false, brilho: 0.2, fator: 1.08, bancada: '#e9e5de', textura: null },
    Cinza: { nome: 'Cinza', cor: '#8f918f', madeira: false, brilho: 0.12, fator: 1.05, bancada: '#ece8e1', textura: null },
    Nogueira: { nome: 'Nogueira', cor: '#734c34', veio: '#3f2719', madeira: true, brilho: 0.1, fator: 1.2, bancada: '#ece8e1', textura: null }
  };

  const MATERIAIS = {
    MDF: { nome: 'MDF', fator: 1 },
    Madeira: { nome: 'Madeira maciça', fator: 1.5 },
    Compensado: { nome: 'Compensado', fator: 1.2 }
  };

  const ESTILOS = {
    moderno: { nome: 'Moderno', puxador: 'barra' },
    contemporaneo: { nome: 'Contemporâneo', puxador: 'barra' },
    minimalista: { nome: 'Minimalista', puxador: 'gola' },
    classico: { nome: 'Clássico', puxador: 'botao' },
    rustico: { nome: 'Rústico', puxador: 'botao' },
    escandinavo: { nome: 'Escandinavo', puxador: 'botao' },
    industrial: { nome: 'Industrial', puxador: 'barra-preta' }
  };

  const ELETRODOMESTICOS = {
    frigorifico: 'Frigorífico',
    forno: 'Forno',
    placa: 'Placa',
    lavaLoica: 'Máquina de lavar loiça',
    microondas: 'Micro-ondas',
    exaustor: 'Exaustor'
  };

  const PRECOS = {
    porta: 180,
    gaveta: 220,
    prateleira: 70,
    varao: 60,
    sapateira: 380,
    maleiro: 150,
    ledPorMetro: 250,
    espelho: 450,
    bancadaPorMetro: 650,
    integracaoEletro: 120,
    montagem: 0.08
  };

  // Faixas de compatibilidade reutilizadas
  const COMPAT = {
    base: { larguraMin: 20, larguraMax: 120, alturaMin: 60, alturaMax: 95, profundidadeMin: 30, profundidadeMax: 70 },
    superior: { larguraMin: 20, larguraMax: 120, alturaMin: 30, alturaMax: 150, profundidadeMin: 25, profundidadeMax: 45 },
    alto: { larguraMin: 40, larguraMax: 90, alturaMin: 150, alturaMax: 320, profundidadeMin: 45, profundidadeMax: 70 },
    roupeiro: { larguraMin: 40, larguraMax: 120, alturaMin: 150, alturaMax: 320, profundidadeMin: 40, profundidadeMax: 70 },
    ilha: { larguraMin: 90, larguraMax: 300, alturaMin: 75, alturaMax: 100, profundidadeMin: 60, profundidadeMax: 130 },
    movel: { larguraMin: 30, larguraMax: 300, alturaMin: 30, alturaMax: 240, profundidadeMin: 25, profundidadeMax: 80 }
  };

  const COMPONENTES_ROUPEIRO = ['porta', 'gaveta', 'prateleira', 'varao', 'sapateira', 'maleiro', 'led', 'espelho'];

  function def(id, nome, tipo, ambientes, zona, largura, altura, profundidade, elevacao, preco, componentes, possiveis, compat) {
    return {
      id,
      nome,
      tipo,
      categoria: ambientes[0],
      ambientes,
      zona, // base | superior | alto | livre
      largura,
      altura,
      profundidade,
      elevacao,
      preco,
      componentes,
      componentesPossiveis: possiveis,
      compatibilidade: compat
    };
  }

  const MODULOS = [
    // ---------------- COZINHA ----------------
    def('inferior-60', 'Armário inferior 60', 'inferior', ['cozinha'], 'base', 60, 82, 58, 0, 950, { portas: 1, gavetas: 1, prateleiras: 1 }, ['porta', 'gaveta', 'prateleira'], COMPAT.base),
    def('inferior-80', 'Armário inferior 80', 'inferior', ['cozinha'], 'base', 80, 82, 58, 0, 1150, { portas: 2, gavetas: 1, prateleiras: 1 }, ['porta', 'gaveta', 'prateleira'], COMPAT.base),
    def('gaveteiro-60', 'Gaveteiro 60', 'gaveteiro', ['cozinha'], 'base', 60, 82, 58, 0, 1350, { gavetas: 3 }, ['gaveta'], COMPAT.base),
    def('placa-60', 'Gaveteiro com placa 60', 'gaveteiro', ['cozinha'], 'base', 60, 82, 58, 0, 1400, { gavetas: 3, placa: 'inducao' }, ['gaveta'], COMPAT.base),
    def('pia-80', 'Módulo de pia 80', 'pia', ['cozinha'], 'base', 80, 82, 58, 0, 1100, { portas: 2, pia: true }, ['porta'], { ...COMPAT.base, larguraMin: 45 }),
    def('forno-60', 'Módulo forno + placa 60', 'forno', ['cozinha'], 'base', 60, 82, 58, 0, 1050, { forno: true, placa: 'inducao', gavetas: 1 }, [], { ...COMPAT.base, larguraMin: 60, larguraMax: 60 }),
    def('lava-loica-60', 'Máquina de loiça integrada 60', 'lava-loica', ['cozinha'], 'base', 60, 82, 58, 0, 700, { lavaLoica: true }, [], { ...COMPAT.base, larguraMin: 45, larguraMax: 60 }),
    def('superior-60', 'Armário superior 60', 'superior', ['cozinha'], 'superior', 60, 72, 35, 145, 700, { portas: 1, prateleiras: 2, led: false }, ['porta', 'prateleira', 'led'], COMPAT.superior),
    def('superior-80', 'Armário superior 80', 'superior', ['cozinha'], 'superior', 80, 72, 35, 145, 820, { portas: 2, prateleiras: 2, led: false }, ['porta', 'prateleira', 'led'], COMPAT.superior),
    def('exaustor-60', 'Superior com exaustor 60', 'exaustor', ['cozinha'], 'superior', 60, 72, 35, 145, 900, { portas: 1, prateleiras: 1, exaustor: true, led: false }, ['porta', 'led'], { ...COMPAT.superior, larguraMin: 60, larguraMax: 90 }),
    def('coluna-60', 'Coluna despenseiro 60', 'coluna', ['cozinha'], 'alto', 60, 217, 58, 0, 2400, { portas: 2, prateleiras: 5 }, ['porta', 'prateleira'], COMPAT.alto),
    def('coluna-forno-60', 'Coluna de fornos 60', 'coluna-forno', ['cozinha'], 'alto', 60, 217, 58, 0, 2600, { forno: true, microondas: true, gavetas: 2 }, ['gaveta'], { ...COMPAT.alto, larguraMin: 60, larguraMax: 60 }),
    def('frigorifico-70', 'Coluna frigorífico 70', 'frigorifico', ['cozinha'], 'alto', 70, 217, 60, 0, 1500, { frigorifico: true }, [], { ...COMPAT.alto, larguraMin: 60, larguraMax: 90 }),
    def('ilha-180', 'Ilha 180', 'ilha', ['cozinha'], 'livre', 180, 82, 90, 0, 3800, { gavetas: 6, portas: 2 }, ['gaveta', 'porta'], COMPAT.ilha),

    // ---------------- ROUPEIRO ----------------
    def('roupeiro-cabides-90', 'Roupeiro · cabides', 'roupeiro', ['roupeiro', 'quarto'], 'alto', 90, 240, 60, 0, 2100, { portas: 2, tipoPorta: 'abrir', varoes: 1, gavetas: 0, prateleiras: 1, sapateira: false, maleiro: true, led: false, espelho: false, trilho: 0 }, COMPONENTES_ROUPEIRO, COMPAT.roupeiro),
    def('roupeiro-duplo-90', 'Roupeiro · cabides duplos', 'roupeiro', ['roupeiro', 'quarto'], 'alto', 90, 240, 60, 0, 2150, { portas: 2, tipoPorta: 'abrir', varoes: 2, gavetas: 0, prateleiras: 0, sapateira: false, maleiro: true, led: false, espelho: false, trilho: 0 }, COMPONENTES_ROUPEIRO, COMPAT.roupeiro),
    def('roupeiro-misto-90', 'Roupeiro · cabides e gavetas', 'roupeiro', ['roupeiro', 'quarto'], 'alto', 90, 240, 60, 0, 2300, { portas: 2, tipoPorta: 'abrir', varoes: 1, gavetas: 3, prateleiras: 0, sapateira: false, maleiro: true, led: false, espelho: false, trilho: 0 }, COMPONENTES_ROUPEIRO, COMPAT.roupeiro),
    def('roupeiro-gavetas-90', 'Roupeiro · gaveteiro', 'roupeiro', ['roupeiro', 'quarto'], 'alto', 90, 240, 60, 0, 2400, { portas: 2, tipoPorta: 'abrir', varoes: 0, gavetas: 5, prateleiras: 3, sapateira: false, maleiro: true, led: false, espelho: false, trilho: 0 }, COMPONENTES_ROUPEIRO, COMPAT.roupeiro),
    def('roupeiro-prateleiras-60', 'Roupeiro · prateleiras', 'roupeiro', ['roupeiro', 'quarto'], 'alto', 60, 240, 60, 0, 1500, { portas: 1, tipoPorta: 'abrir', varoes: 0, gavetas: 0, prateleiras: 6, sapateira: false, maleiro: true, led: false, espelho: false, trilho: 0 }, COMPONENTES_ROUPEIRO, COMPAT.roupeiro),
    def('roupeiro-sapateira-60', 'Roupeiro · sapateira', 'roupeiro', ['roupeiro', 'quarto'], 'alto', 60, 240, 60, 0, 1800, { portas: 1, tipoPorta: 'abrir', varoes: 0, gavetas: 0, prateleiras: 3, sapateira: true, maleiro: true, led: false, espelho: false, trilho: 0 }, COMPONENTES_ROUPEIRO, COMPAT.roupeiro),

    // ---------------- OUTROS AMBIENTES ----------------
    def('movel-tv-180', 'Móvel de TV 180', 'movel-tv', ['sala'], 'base', 180, 45, 42, 0, 1900, { gavetas: 2 }, ['gaveta'], COMPAT.movel),
    def('estante-90', 'Estante 90', 'estante', ['sala', 'escritorio'], 'alto', 90, 180, 35, 0, 1300, { prateleiras: 4 }, ['prateleira', 'led'], COMPAT.movel),
    def('aparador-140', 'Aparador 140', 'aparador', ['sala'], 'base', 140, 80, 45, 0, 1700, { portas: 2, prateleiras: 1 }, ['porta', 'prateleira'], COMPAT.movel),
    def('mesa-cabeceira-50', 'Mesa de cabeceira', 'mesa-cabeceira', ['quarto'], 'base', 50, 47, 42, 0, 650, { gavetas: 2 }, ['gaveta'], COMPAT.movel),
    def('secretaria-140', 'Secretária 140', 'secretaria', ['escritorio'], 'base', 140, 75, 60, 0, 1600, { gavetas: 3 }, ['gaveta'], COMPAT.movel),
    def('bloco-60', 'Módulo personalizado', 'bloco', ['outro'], 'base', 60, 90, 50, 0, 900, { portas: 1, prateleiras: 2 }, ['porta', 'prateleira', 'gaveta'], COMPAT.movel)
  ];

  // Projetos prontos: preferências que alimentam os geradores do estado
  const PRESETS = {
    cozinha: [
      { id: 'cozinha-linear', nome: 'Cozinha linear completa', descricao: 'Uma parede com frigorífico, coluna de fornos, pia e placa', tipo: 'cozinha', espaco: { largura: 360, profundidade: 250, altura: 270 }, preferencias: { formato: 'linear', ilha: false, armazenamento: 'medio' }, eletrodomesticos: ['frigorifico', 'forno', 'placa', 'lavaLoica', 'exaustor'] },
      { id: 'cozinha-l-ilha', nome: 'Cozinha em L com ilha', descricao: 'Duas paredes e ilha central com gavetas', tipo: 'cozinha', espaco: { largura: 400, profundidade: 340, altura: 270 }, preferencias: { formato: 'L', ilha: true, armazenamento: 'alto' }, eletrodomesticos: ['frigorifico', 'forno', 'placa', 'lavaLoica', 'exaustor', 'microondas'] },
      { id: 'cozinha-compacta', nome: 'Cozinha compacta', descricao: 'Solução para espaços pequenos', tipo: 'cozinha', espaco: { largura: 250, profundidade: 200, altura: 260 }, preferencias: { formato: 'linear', ilha: false, armazenamento: 'baixo' }, eletrodomesticos: ['frigorifico', 'forno', 'placa'] }
    ],
    roupeiro: [
      { id: 'roupeiro-4-portas', nome: 'Roupeiro 4 portas até ao teto', descricao: '4 portas de abrir, 8 gavetas e 2 varões', tipo: 'roupeiro', espaco: { largura: 280, profundidade: 300, altura: 260 }, preferencias: { tipoPorta: 'abrir', portas: 4, gavetas: 8, varoes: 2, ateTeto: true, maleiro: true } },
      { id: 'roupeiro-correr', nome: 'Roupeiro de correr com espelho', descricao: '3 portas de correr, sapateira e LED', tipo: 'roupeiro', espaco: { largura: 270, profundidade: 300, altura: 270 }, preferencias: { tipoPorta: 'correr', portas: 3, gavetas: 4, varoes: 2, sapatos: true, led: true, espelho: true } }
    ]
  };

  // ---------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------
  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getModulo(id) {
    return MODULOS.find((m) => m.id === id) || null;
  }

  function listarPorAmbiente(ambiente) {
    return MODULOS.filter((m) => m.ambientes.includes(ambiente));
  }

  function suporta(modulo, componente) {
    const d = getModulo(modulo.catalogoId);
    return !!d && d.componentesPossiveis.includes(componente);
  }

  function limites(modulo) {
    const d = getModulo(modulo.catalogoId);
    return d ? d.compatibilidade : COMPAT.movel;
  }

  // ---------------------------------------------------------------
  // Criação de instâncias
  // ---------------------------------------------------------------
  let sequencia = 0;
  function novoId() {
    sequencia += 1;
    return 'modulo-' + String(sequencia).padStart(3, '0');
  }

  // Ao carregar um projeto guardado, os novos IDs continuam depois dos existentes
  function reservarIds(modulos) {
    (modulos || []).forEach((m) => {
      const n = /^modulo-(\d+)$/.exec((m && m.id) || '');
      if (n) sequencia = Math.max(sequencia, Number(n[1]));
    });
  }

  function criarModulo(catalogoId, extra = {}) {
    const d = getModulo(catalogoId);
    if (!d) return null;
    const modulo = {
      id: extra.id || novoId(),
      catalogoId: d.id,
      tipo: d.tipo,
      nome: extra.nome || d.nome,
      nomeAuto: !extra.nome,
      zona: d.zona,
      parede: extra.parede !== undefined ? extra.parede : (d.zona === 'livre' ? null : 'fundo'),
      posicao: Object.assign({ x: 0, y: d.elevacao || 0, z: 0 }, extra.posicao || {}),
      rotacao: extra.rotacao || 0,
      dimensoes: Object.assign({ largura: d.largura, altura: d.altura, profundidade: d.profundidade }, extra.dimensoes || {}),
      material: extra.material || 'MDF',
      acabamento: extra.acabamento || 'Carvalho',
      componentes: Object.assign(clone(d.componentes), extra.componentes || {})
    };
    if (modulo.nomeAuto) modulo.nome = nomeAutomatico(modulo);
    return modulo;
  }

  const NOMES_BASE = {
    inferior: 'Armário inferior',
    pia: 'Módulo de pia',
    forno: 'Módulo forno + placa',
    'lava-loica': 'Máquina de loiça integrada',
    superior: 'Armário superior',
    exaustor: 'Superior com exaustor',
    coluna: 'Coluna despenseiro',
    'coluna-forno': 'Coluna de fornos',
    frigorifico: 'Coluna frigorífico',
    ilha: 'Ilha',
    'movel-tv': 'Móvel de TV',
    estante: 'Estante',
    aparador: 'Aparador',
    'mesa-cabeceira': 'Mesa de cabeceira',
    secretaria: 'Secretária',
    bloco: 'Módulo personalizado'
  };

  function nomeAutomatico(m) {
    const c = m.componentes || {};
    const largura = Math.round(m.dimensoes.largura);
    if (m.tipo === 'roupeiro') {
      if (c.varoes >= 2) return 'Roupeiro · cabides duplos';
      if (c.varoes === 1 && c.gavetas > 0) return 'Roupeiro · cabides e gavetas';
      if (c.varoes === 1) return 'Roupeiro · cabides';
      if (c.sapateira) return 'Roupeiro · sapateira';
      if (c.gavetas > 0) return 'Roupeiro · gaveteiro';
      return 'Roupeiro · prateleiras';
    }
    if (m.tipo === 'gaveteiro') return (c.placa ? 'Gaveteiro com placa ' : 'Gaveteiro ') + largura;
    if (['mesa-cabeceira', 'bloco'].includes(m.tipo)) return NOMES_BASE[m.tipo];
    return (NOMES_BASE[m.tipo] || 'Módulo') + ' ' + largura;
  }

  // ---------------------------------------------------------------
  // Interior do roupeiro (cm). Partilhado entre validação e 3D.
  // ---------------------------------------------------------------
  const ROUPEIRO = { rodape: 8, espessura: 1.8, gaveta: 20, sapateira: 54, maleiro: 40, pendurar: 95, prateleiraMin: 24 };

  function layoutRoupeiro(m) {
    const c = m.componentes || {};
    const h = m.dimensoes.altura;
    const e = ROUPEIRO.espessura;
    const res = { gavetas: [], prateleiras: [], varoes: [], sapateira: null, maleiro: null, cabe: true, zonaPortas: null };
    let base = ROUPEIRO.rodape + e;
    let topo = h - e;

    if (c.maleiro && h >= 200) {
      const y = topo - ROUPEIRO.maleiro;
      res.maleiro = y;
      res.prateleiras.push(y);
      topo = y - e;
    }

    for (let i = 0; i < (c.gavetas || 0); i += 1) {
      res.gavetas.push({ y0: base, y1: base + ROUPEIRO.gaveta - 0.5 });
      base += ROUPEIRO.gaveta;
    }
    if (c.gavetas) {
      res.prateleiras.push(base + 0.5);
      base += e + 0.5;
    }

    if (c.sapateira) {
      res.sapateira = { y0: base, y1: base + ROUPEIRO.sapateira };
      base += ROUPEIRO.sapateira;
      res.prateleiras.push(base);
      base += e;
    }

    const livre = topo - base;
    const varoes = Math.min(2, c.varoes || 0);
    const extras = c.prateleiras || 0;

    if (varoes === 2) {
      if (livre < ROUPEIRO.pendurar * 2 - 10) res.cabe = false;
      const meio = base + livre / 2;
      res.prateleiras.push(meio);
      res.varoes.push({ y: topo - 6, queda: livre / 2 - 12 });
      res.varoes.push({ y: meio - 6, queda: livre / 2 - 12 });
    } else if (varoes === 1) {
      const zona = Math.max(ROUPEIRO.pendurar, livre - extras * 30);
      if (livre < ROUPEIRO.pendurar) res.cabe = false;
      const topoZona = Math.min(topo, base + zona);
      res.varoes.push({ y: topoZona - 6, queda: Math.min(zona - 12, 115) });
      if (topoZona < topo - 20) {
        res.prateleiras.push(topoZona);
        const acima = topo - topoZona;
        const n = Math.min(extras, Math.floor(acima / ROUPEIRO.prateleiraMin));
        for (let k = 1; k < n; k += 1) res.prateleiras.push(topoZona + (acima * k) / n);
        if (extras > Math.max(1, n)) res.cabe = false;
      } else if (extras > 0) {
        res.cabe = false;
      }
    } else if (extras > 0) {
      if (extras * ROUPEIRO.prateleiraMin > livre + 5) res.cabe = false;
      for (let k = 1; k <= extras; k += 1) res.prateleiras.push(base + (livre * k) / (extras + 1));
    }

    if (livre < 0) res.cabe = false;
    return res;
  }

  // ---------------------------------------------------------------
  // Preço aproximado de um módulo
  // ---------------------------------------------------------------
  function precoModulo(m, projeto) {
    const d = getModulo(m.catalogoId);
    if (!d) return { estrutura: 0, frentes: 0, interiores: 0, iluminacao: 0, total: 0 };
    const c = m.componentes || {};
    const fatorAcab = (ACABAMENTOS[projeto.acabamento] || ACABAMENTOS.Carvalho).fator;
    const fatorMat = (MATERIAIS[projeto.material] || MATERIAIS.MDF).fator;
    const rLarg = m.dimensoes.largura / d.largura;
    const rAlt = m.dimensoes.altura / d.altura;
    const estrutura = d.preco * (0.4 + 0.6 * rLarg) * (0.6 + 0.4 * rAlt) * fatorMat;
    const portas = (c.portas || 0) * PRECOS.porta * Math.max(0.6, rAlt);
    const frentes = (portas + (c.gavetas || 0) * PRECOS.gaveta) * fatorAcab;
    const interiores =
      (c.prateleiras || 0) * PRECOS.prateleira +
      (c.varoes || 0) * PRECOS.varao +
      (c.sapateira ? PRECOS.sapateira : 0) +
      (c.maleiro ? PRECOS.maleiro : 0) +
      (c.espelho ? PRECOS.espelho : 0);
    const iluminacao = c.led ? PRECOS.ledPorMetro * Math.max(0.5, m.dimensoes.largura / 100) : 0;
    const total = estrutura + frentes + interiores + iluminacao;
    return { estrutura, frentes, interiores, iluminacao, total };
  }

  function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(valor || 0);
  }

  global.NovariCatalog = {
    AMBIENTES,
    ACABAMENTOS,
    MATERIAIS,
    ESTILOS,
    ELETRODOMESTICOS,
    PRECOS,
    MODULOS,
    PRESETS,
    ROUPEIRO,
    getModulo,
    listarPorAmbiente,
    suporta,
    limites,
    criarModulo,
    reservarIds,
    nomeAutomatico,
    layoutRoupeiro,
    precoModulo,
    formatarMoeda,
    clone
  };

  // Compatibilidade com o nome antigo
  global.NovariFurnitureCatalog = global.NovariCatalog;
})(typeof window !== 'undefined' ? window : globalThis);
