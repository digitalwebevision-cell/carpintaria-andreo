/* ============================================================
   NOVARI — ESTADO CENTRAL DO PROJETO
   Fonte única de verdade. A IA e a interface alteram o projeto
   apenas através de comandos estruturados; o motor 3D apenas
   lê o projeto e renderiza. Medidas em cm, coordenadas com a
   origem no centro do chão do ambiente (x → direita, z → fundo).
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.NovariCatalog;

  const PREFERENCIAS_PADRAO = {
    // cozinha
    formato: 'linear',
    armazenamento: 'medio',
    ilha: false,
    bancada: true,
    ateTeto: false,
    ladoFrigorifico: 'direita',
    posicaoPia: 'centro',
    placa: 'inducao',
    pessoas: null,
    qtdInferiores: null,
    // roupeiro
    tipoPorta: 'abrir',
    portas: null,
    roupa: 'media',
    gavetas: null,
    varoes: null,
    prateleiras: null,
    sapatos: false,
    maleiro: true,
    led: false,
    espelho: false,
    profundidadeMovel: 60
  };

  const ELETRO_PADRAO = ['frigorifico', 'forno', 'placa', 'lavaLoica', 'exaustor'];
  const COM_BANCADA = ['inferior', 'gaveteiro', 'pia', 'forno', 'lava-loica'];

  function criarProjetoInicial(tipo) {
    const t = tipo || 'cozinha';
    const projeto = {
      tipo: t,
      espaco: { largura: 320, profundidade: t === 'roupeiro' ? 300 : 240, altura: 270 },
      paredes: [],
      portas: [],
      janelas: [],
      pontos: { agua: [], gas: [], eletrica: [] },
      estilo: 'moderno',
      material: 'MDF',
      acabamento: 'Carvalho',
      preferencias: C.clone(PREFERENCIAS_PADRAO),
      eletrodomesticos: ELETRO_PADRAO.slice(),
      modulos: [],
      observacoes: '',
      estado: 'em_configuracao',
      selecionado: null,
      layoutManual: false,
      avisos: [],
      conversa: { respondidos: {}, perguntaAtual: null, concluida: false, historico: [] }
    };
    atualizarParedes(projeto);
    return projeto;
  }

  // ---------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const r1 = (v) => Math.round(v * 10) / 10;
  const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

  function ok(mensagem, alteracoes, extra) {
    return Object.assign({ ok: true, mensagem: mensagem || '', alteracoes: alteracoes || [] }, extra || {});
  }
  function falha(mensagem) {
    return { ok: false, mensagem, alteracoes: [] };
  }

  function atualizarParedes(p) {
    const { largura: W, profundidade: D, altura: H } = p.espaco;
    p.paredes = [
      { id: 'fundo', comprimento: W, altura: H },
      { id: 'esquerda', comprimento: D, altura: H },
      { id: 'direita', comprimento: D, altura: H }
    ];
  }

  function comprimentoParede(p, parede) {
    return parede === 'fundo' || parede === 'frente' ? p.espaco.largura : p.espaco.profundidade;
  }

  function getModuloPorId(p, id) {
    return p.modulos.find((m) => m.id === id) || null;
  }

  // ---------------------------------------------------------------
  // Geometria / colisões
  // ---------------------------------------------------------------
  function pegada(m, pos) {
    const ang = ((m.rotacao || 0) * Math.PI) / 180;
    const W = m.dimensoes.largura;
    const D = m.dimensoes.profundidade;
    const w = Math.abs(W * Math.cos(ang)) + Math.abs(D * Math.sin(ang));
    const d = Math.abs(W * Math.sin(ang)) + Math.abs(D * Math.cos(ang));
    const x = pos ? pos.x : m.posicao.x;
    const z = pos ? pos.z : m.posicao.z;
    return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, w, d };
  }

  function faixaVertical(m) {
    const y0 = m.posicao.y || 0;
    const extra = COM_BANCADA.includes(m.tipo) || m.tipo === 'ilha' ? 4 : 0;
    return [y0, y0 + m.dimensoes.altura + extra];
  }

  function colide(p, m, pos) {
    const a = pegada(m, pos);
    const [ya0, ya1] = faixaVertical(m);
    const tol = 0.5;
    return p.modulos.some((o) => {
      if (o.id === m.id) return false;
      const b = pegada(o);
      const [yb0, yb1] = faixaVertical(o);
      return a.x0 < b.x1 - tol && a.x1 > b.x0 + tol && a.z0 < b.z1 - tol && a.z1 > b.z0 + tol && ya0 < yb1 - tol && ya1 > yb0 + tol;
    });
  }

  // Aplica as regras do ambiente a uma posição desejada (paredes, limites, íman)
  function restringir(p, m, x, z) {
    const W = p.espaco.largura;
    const D = p.espaco.profundidade;
    const f = pegada(m, { x: 0, z: 0 });
    const hw = f.w / 2;
    const hd = f.d / 2;
    let nx = Number(x) || 0;
    let nz = Number(z) || 0;

    if (m.parede === 'fundo') nz = D / 2 - hd;
    else if (m.parede === 'esquerda') nx = -W / 2 + hw;
    else if (m.parede === 'direita') nx = W / 2 - hw;

    nx = hw * 2 >= W ? 0 : clamp(nx, -W / 2 + hw, W / 2 - hw);
    nz = hd * 2 >= D ? 0 : clamp(nz, -D / 2 + hd, D / 2 - hd);

    // Íman: encosta aos módulos vizinhos quando fica a menos de 4 cm
    const ima = 4;
    p.modulos.forEach((o) => {
      if (o.id === m.id) return;
      const b = pegada(o);
      const moveX = m.parede !== 'esquerda' && m.parede !== 'direita';
      const moveZ = m.parede !== 'fundo';
      if (moveX) {
        if (Math.abs(nx - hw - b.x1) < ima) nx = b.x1 + hw;
        else if (Math.abs(nx + hw - b.x0) < ima) nx = b.x0 - hw;
      }
      if (moveZ) {
        if (Math.abs(nz - hd - b.z1) < ima) nz = b.z1 + hd;
        else if (Math.abs(nz + hd - b.z0) < ima) nz = b.z0 - hd;
      }
    });

    nx = r1(nx);
    nz = r1(nz);
    return { x: nx, z: nz, valido: !colide(p, m, { x: nx, z: nz }) };
  }

  function posicaoLivre(p, m, x, z) {
    let r = restringir(p, m, x, z);
    if (r.valido) return r;
    const passo = 2;
    const max = Math.max(p.espaco.largura, p.espaco.profundidade);
    for (let dist = passo; dist <= max; dist += passo) {
      let candidatos;
      if (m.parede === 'fundo') candidatos = [[x - dist, z], [x + dist, z]];
      else if (m.parede === 'esquerda' || m.parede === 'direita') candidatos = [[x, z - dist], [x, z + dist]];
      else candidatos = [[x - dist, z], [x + dist, z], [x, z - dist], [x, z + dist], [x - dist, z - dist], [x + dist, z - dist]];
      for (const [cx, cz] of candidatos) {
        r = restringir(p, m, cx, cz);
        if (r.valido) return r;
      }
    }
    return null;
  }

  // Primeiro espaço livre da esquerda para a direita numa parede
  function colocarNaParede(p, m) {
    const W = p.espaco.largura;
    const D = p.espaco.profundidade;
    const f = pegada(m, { x: 0, z: 0 });
    const lateral = m.parede === 'esquerda' || m.parede === 'direita';
    const inicio = lateral ? D / 2 - f.d / 2 : -W / 2 + f.w / 2;
    const candidatos = [inicio];
    p.modulos.forEach((o) => {
      if (o.id === m.id) return;
      const b = pegada(o);
      if (lateral) candidatos.push(b.z0 - f.d / 2, b.z1 + f.d / 2);
      else candidatos.push(b.x1 + f.w / 2, b.x0 - f.w / 2);
    });
    candidatos.sort((a, b) => (lateral ? b - a : a - b));
    for (const c of candidatos) {
      const r = lateral ? restringir(p, m, 0, c) : restringir(p, m, c, 0);
      if (r.valido && Math.abs((lateral ? r.z : r.x) - c) < 0.2) return r;
    }
    return null;
  }

  // Reencaixa módulos quando o ambiente muda de medida
  function ajustarAoEspaco(p) {
    const H = p.espaco.altura;
    const notas = [];
    p.modulos.forEach((m) => {
      const lim = C.limites(m);
      const comprimento = m.parede ? comprimentoParede(p, m.parede) : p.espaco.largura;
      if (m.dimensoes.largura > comprimento) m.dimensoes.largura = Math.max(lim.larguraMin, comprimento);
      if (p.preferencias.ateTeto && (m.zona === 'alto' || m.zona === 'superior')) {
        m.dimensoes.altura = clamp(H - (m.posicao.y || 0), lim.alturaMin, lim.alturaMax);
      }
      if ((m.posicao.y || 0) + m.dimensoes.altura > H) {
        m.dimensoes.altura = Math.max(lim.alturaMin, H - (m.posicao.y || 0));
      }
      const r = restringir(p, m, m.posicao.x, m.posicao.z);
      m.posicao.x = r.x;
      m.posicao.z = r.z;
      if (!r.valido) notas.push(m.nome);
    });
    if (notas.length) return `Atenção: ${notas.length} módulo(s) ficaram sobrepostos com as novas medidas.`;
    return '';
  }

  // ---------------------------------------------------------------
  // Geradores de layout
  // ---------------------------------------------------------------
  function preparar(p, catalogoId, extra) {
    return C.criarModulo(catalogoId, Object.assign({ material: p.material, acabamento: p.acabamento }, extra || {}));
  }

  function dividir(largura, maxModulo) {
    if (largura < 15) return [];
    const n = Math.max(1, Math.ceil(largura / (maxModulo || 80)));
    const w = r1(largura / n);
    return Array.from({ length: n }, () => w);
  }

  function janelaNaParede(p, parede) {
    return p.janelas.find((j) => j.parede === parede) || null;
  }

  function gerarCozinha(p) {
    const W = p.espaco.largura;
    const D = p.espaco.profundidade;
    const H = p.espaco.altura;
    const pref = p.preferencias;
    const eletro = new Set(p.eletrodomesticos);
    const notas = [];
    const modulos = [];

    const ELEV_SUP = 145;
    const alturaAlto = pref.ateTeto ? H : Math.min(H, 217);
    const alturaSup = pref.ateTeto ? Math.max(40, H - ELEV_SUP) : Math.min(72, H - ELEV_SUP);

    // Parede lateral usada no formato em L (evita a parede com porta)
    const portaLateral = p.portas.find((pt) => pt.parede === 'esquerda' || pt.parede === 'direita');
    let paredeL = null;
    if (pref.formato === 'L') {
      paredeL = portaLateral && portaLateral.parede === 'esquerda' ? 'direita' : 'esquerda';
    }
    let ladoFrig = pref.ladoFrigorifico === 'esquerda' ? 'esquerda' : 'direita';
    if (paredeL && paredeL === ladoFrig) ladoFrig = paredeL === 'esquerda' ? 'direita' : 'esquerda';

    // ---- colunas (altas) ----
    const altos = [];
    if (eletro.has('frigorifico')) altos.push({ id: 'frigorifico-70', largura: 70 });
    let fornoEmColuna = eletro.has('forno') && pref.armazenamento !== 'baixo' && W >= 340;
    if (fornoEmColuna) altos.push({ id: 'coluna-forno-60', largura: 60 });
    if (pref.armazenamento === 'alto' && W >= 380) altos.push({ id: 'coluna-60', largura: 60 });

    // ---- grupos fixos da bancada ----
    const temPlaca = eletro.has('placa') || eletro.has('forno');
    const placaTipo = pref.placa || 'inducao';
    let grupoPia = [{ id: 'pia-80', largura: 80, papel: 'pia' }];
    if (eletro.has('lavaLoica')) grupoPia.push({ id: 'lava-loica-60', largura: 60, papel: 'lava' });
    let grupoPlaca = [];
    const montarGrupoPlaca = () => {
      grupoPlaca = [];
      if (eletro.has('forno') && !fornoEmColuna) grupoPlaca.push({ id: 'forno-60', largura: 60, papel: 'placa' });
      else if (temPlaca) grupoPlaca.push({ id: 'placa-60', largura: 60, papel: 'placa' });
      if (pref.armazenamento !== 'baixo') grupoPlaca.push({ id: 'gaveteiro-60', largura: 60, papel: 'extra' });
    };
    montarGrupoPlaca();

    const soma = (lista) => lista.reduce((s, it) => s + it.largura, 0);
    const disponivel = () => W - soma(altos) - soma(grupoPia) - soma(grupoPlaca);

    // Retira opcionais até caber
    const cortes = [
      () => { const i = altos.findIndex((a) => a.id === 'coluna-60'); if (i >= 0) { altos.splice(i, 1); return true; } return false; },
      () => { const i = grupoPlaca.findIndex((g) => g.papel === 'extra'); if (i >= 0) { grupoPlaca.splice(i, 1); return true; } return false; },
      () => { const i = grupoPia.findIndex((g) => g.papel === 'lava'); if (i >= 0) { grupoPia.splice(i, 1); notas.push('Não coube a máquina de loiça nesta largura.'); return true; } return false; },
      () => { if (fornoEmColuna) { fornoEmColuna = false; altos.splice(altos.findIndex((a) => a.id === 'coluna-forno-60'), 1); montarGrupoPlaca(); grupoPlaca = grupoPlaca.filter((g) => g.papel !== 'extra'); return true; } return false; },
      () => { const i = altos.findIndex((a) => a.id === 'frigorifico-70'); if (i >= 0) { altos.splice(i, 1); notas.push('O frigorífico não coube na parede principal; considere colocá-lo noutra parede.'); return true; } return false; },
      () => { if (grupoPia[0].largura > 60) { grupoPia[0].largura = 60; return true; } return false; }
    ];
    for (const corte of cortes) {
      if (disponivel() >= 0) break;
      corte();
    }
    if (disponivel() < 0) notas.push('O espaço é muito reduzido para todos os módulos; reveja a largura.');

    // ---- montagem da linha de fundo ----
    const zonaInicio = -W / 2 + (ladoFrig === 'esquerda' ? soma(altos) : 0);
    const Z = W - soma(altos);
    const F = Math.max(0, disponivel());

    // alvo da pia
    const janela = janelaNaParede(p, 'fundo');
    let alvoPia;
    const posPia = pref.posicaoPia === 'janela' && !janela ? 'centro' : pref.posicaoPia;
    if (posPia === 'janela' && janela) alvoPia = -W / 2 + janela.posicao;
    else if (posPia === 'esquerda') alvoPia = zonaInicio;
    else if (posPia === 'direita') alvoPia = zonaInicio + Z;
    else alvoPia = zonaInicio + Z / 2;

    const piaADireita = alvoPia > zonaInicio + Z / 2 + 1;
    const larguraPia = grupoPia[0].largura;
    let fillA;
    if (!piaADireita) fillA = clamp(alvoPia - zonaInicio - larguraPia / 2, 0, F);
    else fillA = clamp(zonaInicio + Z - alvoPia - larguraPia / 2, 0, F);
    let resto = F - fillA;
    let fillB = resto > 0 ? Math.min(resto, Math.max(Math.min(resto, 60), Math.round(resto / 2))) : 0;
    let fillC = resto - fillB;

    // Quantidade explícita de módulos inferiores
    const fixosBase = grupoPia.length + grupoPlaca.length;
    let enchimento = null;
    if (pref.qtdInferiores) {
      const n = Math.max(0, pref.qtdInferiores - fixosBase);
      fillA = 0;
      fillB = F;
      fillC = 0;
      if (n === 0) enchimento = [];
      else {
        const w = r1(Math.min(120, F / n));
        enchimento = Array.from({ length: n }, () => w);
      }
    }

    // pequenos restos juntam-se ao segmento central
    [fillA, fillC].forEach((v, i) => {
      if (v > 0 && v < 20) {
        fillB += v;
        if (i === 0) fillA = 0; else fillC = 0;
      }
    });

    const enche = (w, primeiro) => dividir(w, 80).map((lw, i) => ({ id: 'inferior-60', largura: lw, papel: 'fill', gavetas: primeiro && i === 0 ? 1 : 1 }));
    let seq = [
      ...enche(fillA),
      ...grupoPia,
      ...(enchimento ? enchimento.map((lw) => ({ id: 'inferior-60', largura: lw, papel: 'fill' })) : enche(fillB)),
      ...grupoPlaca,
      ...enche(fillC)
    ];
    if (piaADireita) seq = seq.reverse();

    // Ajusta a soma para ocupar exatamente a zona
    const sobra = r1(Z - soma(seq));
    if (Math.abs(sobra) >= 0.1 && !pref.qtdInferiores) {
      const ajustavel = seq.filter((s) => s.papel === 'fill').sort((a, b) => b.largura - a.largura)[0];
      if (ajustavel && ajustavel.largura + sobra >= 20) ajustavel.largura = r1(ajustavel.largura + sobra);
    }

    let cursor = zonaInicio;
    const linhaBase = [];
    seq.forEach((s) => {
      const m = preparar(p, s.id, { parede: 'fundo' });
      m.dimensoes.largura = s.largura;
      if (m.tipo === 'inferior') m.componentes.portas = s.largura > 60 ? 2 : 1;
      if (s.id === 'forno-60' || s.id === 'placa-60') m.componentes.placa = placaTipo;
      if (m.tipo === 'pia' && s.largura < 70) m.componentes.portas = 1;
      m.posicao.x = r1(cursor + s.largura / 2);
      m.posicao.z = r1(D / 2 - m.dimensoes.profundidade / 2);
      m.nome = C.nomeAutomatico(m);
      cursor += s.largura;
      linhaBase.push(m);
    });
    modulos.push(...linhaBase);

    // Colunas nas extremidades (frigorífico encostado à parede)
    const ordemAltos = ladoFrig === 'esquerda' ? altos.slice().reverse() : altos.slice();
    let cursorAlto = ladoFrig === 'esquerda' ? -W / 2 : zonaInicio + Z;
    ordemAltos.forEach((a) => {
      const m = preparar(p, a.id, { parede: 'fundo' });
      m.dimensoes.largura = a.largura;
      m.dimensoes.altura = alturaAlto;
      m.posicao.x = r1(cursorAlto + a.largura / 2);
      m.posicao.z = r1(D / 2 - m.dimensoes.profundidade / 2);
      cursorAlto += a.largura;
      m.nome = C.nomeAutomatico(m);
      modulos.push(m);
    });

    // ---- armários superiores ----
    const faixaJanela = janela ? [-W / 2 + janela.posicao - janela.largura / 2 - 5, -W / 2 + janela.posicao + janela.largura / 2 + 5] : null;
    const janelaAlta = janela && janela.peitoril < ELEV_SUP + alturaSup && janela.peitoril + janela.altura > ELEV_SUP;
    let semSuperiores = 0;
    linhaBase.forEach((b) => {
      const x0 = b.posicao.x - b.dimensoes.largura / 2;
      const x1 = b.posicao.x + b.dimensoes.largura / 2;
      if (faixaJanela && janelaAlta && x0 < faixaJanela[1] && x1 > faixaJanela[0]) {
        semSuperiores += 1;
        return;
      }
      const sobrePlaca = b.componentes.placa || b.tipo === 'forno';
      const id = sobrePlaca && eletro.has('exaustor') && b.dimensoes.largura >= 60 ? 'exaustor-60' : 'superior-60';
      const m = preparar(p, id, { parede: 'fundo' });
      m.dimensoes.largura = b.dimensoes.largura;
      m.dimensoes.altura = alturaSup;
      m.componentes.portas = b.dimensoes.largura > 60 ? 2 : 1;
      m.posicao.x = b.posicao.x;
      m.posicao.y = ELEV_SUP;
      m.posicao.z = r1(D / 2 - m.dimensoes.profundidade / 2);
      m.nome = C.nomeAutomatico(m);
      modulos.push(m);
    });
    if (semSuperiores) notas.push('Deixei a zona da janela livre de armários superiores.');

    // ---- segunda parede (L) ----
    if (paredeL) {
      const comp = Math.min(D - 58 - 40, 300);
      if (comp >= 60) {
        const larguras = dividir(comp, 80);
        let z = D / 2 - 58;
        larguras.forEach((lw, i) => {
          const base = preparar(p, i === 0 ? 'gaveteiro-60' : 'inferior-60', { parede: paredeL, rotacao: paredeL === 'esquerda' ? -90 : 90 });
          base.dimensoes.largura = lw;
          if (base.tipo === 'inferior') base.componentes.portas = lw > 60 ? 2 : 1;
          const cx = paredeL === 'esquerda' ? -W / 2 + base.dimensoes.profundidade / 2 : W / 2 - base.dimensoes.profundidade / 2;
          base.posicao.x = r1(cx);
          base.posicao.z = r1(z - lw / 2);
          base.nome = C.nomeAutomatico(base);
          modulos.push(base);

          const sup = preparar(p, 'superior-60', { parede: paredeL, rotacao: base.rotacao });
          sup.dimensoes.largura = lw;
          sup.dimensoes.altura = alturaSup;
          sup.componentes.portas = lw > 60 ? 2 : 1;
          sup.posicao.x = r1(paredeL === 'esquerda' ? -W / 2 + sup.dimensoes.profundidade / 2 : W / 2 - sup.dimensoes.profundidade / 2);
          sup.posicao.y = ELEV_SUP;
          sup.posicao.z = base.posicao.z;
          sup.nome = C.nomeAutomatico(sup);
          modulos.push(sup);
          z -= lw;
        });
      } else {
        notas.push('A profundidade não permite a segunda parede do L.');
      }
    }

    // ---- ilha ----
    if (pref.ilha) {
      const ilha = criarIlha(p, modulos);
      if (ilha.modulo) modulos.push(ilha.modulo);
      else notas.push(ilha.nota);
    }

    // ---- pontos técnicos derivados ----
    const pia = modulos.find((m) => m.tipo === 'pia');
    const placa = modulos.find((m) => m.componentes.placa);
    p.pontos.agua = pia ? [{ parede: 'fundo', posicao: r1(pia.posicao.x + W / 2), altura: 55 }] : [];
    p.pontos.gas = placa && placaTipo === 'gas' ? [{ parede: 'fundo', posicao: r1(placa.posicao.x + W / 2), altura: 60 }] : [];
    p.pontos.eletrica = modulos
      .filter((m) => m.parede === 'fundo' && (m.tipo === 'frigorifico' || m.tipo === 'coluna-forno' || m.tipo === 'lava-loica' || (m.componentes.placa && placaTipo !== 'gas') || m.tipo === 'inferior'))
      .slice(0, 5)
      .map((m) => ({ parede: 'fundo', posicao: r1(m.posicao.x + W / 2), altura: m.zona === 'alto' || m.tipo === 'lava-loica' ? 30 : 110 }));

    return { modulos, notas };
  }

  function criarIlha(p, existentes) {
    const W = p.espaco.largura;
    const D = p.espaco.profundidade;
    const profIlha = 90;
    const necessario = 58 + 100 + profIlha + 20;
    if (D < necessario) {
      return { modulo: null, nota: `Para uma ilha com passagem confortável são precisos pelo menos ${necessario} cm de profundidade (o espaço tem ${D} cm).` };
    }
    const larg = clamp(Math.round((W - 160) / 10) * 10, 100, 220);
    const m = preparar(p, 'ilha-180', { parede: null });
    m.dimensoes.largura = larg;
    m.componentes.gavetas = 3 * Math.max(1, Math.round(larg / 120));
    m.posicao.x = p.preferencias.formato === 'L' ? (p.preferencias.ladoFrigorifico === 'direita' ? 20 : -20) : 0;
    m.posicao.z = r1(D / 2 - 58 - 100 - profIlha / 2);
    m.nome = C.nomeAutomatico(m);
    const tmp = { espaco: p.espaco, modulos: existentes };
    const r = posicaoLivre(tmp, m, m.posicao.x, m.posicao.z);
    if (!r) return { modulo: null, nota: 'Não encontrei espaço livre para a ilha.' };
    m.posicao.x = r.x;
    m.posicao.z = r.z;
    return { modulo: m, nota: '' };
  }

  function sugestaoPortasRoupeiro(largura, tipoPorta) {
    if (tipoPorta === 'correr') return clamp(Math.round(largura / 100), 2, 5);
    return clamp(Math.round(largura / 50), 1, 10);
  }

  function gerarRoupeiro(p) {
    const W = p.espaco.largura;
    const D = p.espaco.profundidade;
    const H = p.espaco.altura;
    const pref = p.preferencias;
    const notas = [];
    const prof = clamp(pref.profundidadeMovel || 60, 40, 70);
    const altura = pref.ateTeto ? H : Math.min(H - 10, 240);
    const total = W;
    const tipoPorta = pref.tipoPorta || 'abrir';

    let n;
    if (tipoPorta === 'correr') n = pref.portas || sugestaoPortasRoupeiro(total, 'correr');
    else if (tipoPorta === 'abrir' && pref.portas) n = Math.max(1, Math.ceil(pref.portas / 2));
    else n = Math.max(1, Math.round(total / 90));
    while (total / n > 120) n += 1;
    while (n > 1 && total / n < 40) n -= 1;
    const wSec = r1(total / n);

    // portas por secção (abrir)
    const totalPortas = tipoPorta === 'abrir' ? (pref.portas || n * (wSec >= 70 ? 2 : 1)) : 0;

    const varoesPadrao = { muita: Math.max(1, Math.ceil(n * 0.75)), media: Math.max(1, Math.round(n / 2)), pouca: Math.max(1, Math.floor(n / 3)) };
    const varoes = pref.varoes !== null && pref.varoes !== undefined ? pref.varoes : varoesPadrao[pref.roupa] || varoesPadrao.media;
    const gavetas = pref.gavetas !== null && pref.gavetas !== undefined ? pref.gavetas : n >= 2 ? 4 : 3;

    const seccoes = Array.from({ length: n }, () => ({ varoes: 0, gavetas: 0, prateleiras: 0, sapateira: false }));
    for (let i = 0; i < varoes; i += 1) {
      const s = seccoes[i % n];
      if (s.varoes < 2) s.varoes += 1;
    }

    // gavetas: concentra em secções sem varão, depois nas de varão simples
    let restantes = gavetas;
    const candidatas = seccoes.map((s, i) => i).filter((i) => seccoes[i].varoes < 2).sort((a, b) => seccoes[a].varoes - seccoes[b].varoes);
    candidatas.forEach((i) => {
      const limite = seccoes[i].varoes === 0 ? 6 : 4;
      const dar = Math.min(limite, restantes);
      seccoes[i].gavetas = dar;
      restantes -= dar;
    });
    if (restantes > 0) notas.push(`Couberam ${gavetas - restantes} das ${gavetas} gavetas pedidas.`);

    if (pref.sapatos) {
      const alvo = seccoes.slice().reverse().find((s) => s.varoes === 0) || seccoes.slice().reverse().find((s) => s.varoes < 2) || seccoes[n - 1];
      alvo.sapateira = true;
      if (alvo.gavetas > 3) alvo.gavetas = 3;
    }

    seccoes.forEach((s) => {
      if (s.varoes === 0) {
        const usada = s.gavetas * 20 + (s.sapateira ? 56 : 0) + (pref.maleiro ? 42 : 0) + 12;
        s.prateleiras = pref.prateleiras !== null && pref.prateleiras !== undefined ? Math.round(pref.prateleiras / n) : Math.max(1, Math.floor((altura - usada) / 38));
      }
    });

    const modulos = [];
    let portasRestantes = totalPortas;
    seccoes.forEach((s, i) => {
      const m = preparar(p, 'roupeiro-cabides-90', { parede: 'fundo' });
      m.dimensoes = { largura: wSec, altura, profundidade: prof };
      let portas = 0;
      if (tipoPorta === 'abrir') {
        const seccoesRest = n - i;
        portas = clamp(Math.round(portasRestantes / seccoesRest), 1, wSec < 50 ? 1 : 2);
        portasRestantes -= portas;
      } else if (tipoPorta === 'correr') portas = 1;
      m.componentes = {
        portas,
        tipoPorta,
        varoes: s.varoes,
        gavetas: s.gavetas,
        prateleiras: s.prateleiras,
        sapateira: s.sapateira,
        maleiro: !!pref.maleiro && altura >= 200,
        led: !!pref.led,
        espelho: !!pref.espelho && tipoPorta !== 'nenhuma' && i === Math.floor(n / 2),
        trilho: i % 2
      };
      // garante que o interior cabe
      let lay = C.layoutRoupeiro(m);
      while (!lay.cabe && (m.componentes.gavetas > 0 || m.componentes.prateleiras > 0)) {
        if (m.componentes.prateleiras > 0) m.componentes.prateleiras -= 1;
        else m.componentes.gavetas -= 1;
        lay = C.layoutRoupeiro(m);
      }
      m.posicao.x = r1(-total / 2 + wSec * (i + 0.5));
      m.posicao.z = r1(D / 2 - prof / 2);
      m.nome = C.nomeAutomatico(m);
      modulos.push(m);
    });

    p.pontos = { agua: [], gas: [], eletrica: pref.led ? [{ parede: 'fundo', posicao: r1(W / 2), altura: altura + 5 }] : [] };
    return { modulos, notas };
  }

  function gerarOutro(p) {
    const semente = {
      sala: ['estante-90', 'movel-tv-180', 'estante-90'],
      quarto: ['mesa-cabeceira-50', 'roupeiro-cabides-90', 'roupeiro-misto-90', 'mesa-cabeceira-50'],
      escritorio: ['secretaria-140', 'estante-90'],
      outro: ['bloco-60', 'bloco-60']
    }[p.tipo] || ['bloco-60'];
    const modulos = semente.map((id) => preparar(p, id, { parede: 'fundo' }));
    const total = modulos.reduce((s, m) => s + m.dimensoes.largura, 0);
    let cursor = -Math.min(total, p.espaco.largura) / 2;
    modulos.forEach((m) => {
      m.dimensoes.altura = Math.min(m.dimensoes.altura, p.espaco.altura - 5);
      m.posicao.x = r1(cursor + m.dimensoes.largura / 2);
      m.posicao.z = r1(p.espaco.profundidade / 2 - m.dimensoes.profundidade / 2);
      cursor += m.dimensoes.largura;
    });
    return { modulos: modulos.filter((m) => m.posicao.x + m.dimensoes.largura / 2 <= p.espaco.largura / 2 + 0.5), notas: [] };
  }

  function gerarLayout(p) {
    let r;
    if (p.tipo === 'cozinha') r = gerarCozinha(p);
    else if (p.tipo === 'roupeiro') r = gerarRoupeiro(p);
    else r = gerarOutro(p);
    p.modulos = r.modulos;
    p.selecionado = null;
    p.layoutManual = false;
    p.avisos = r.notas;
    return r.notas;
  }

  // ---------------------------------------------------------------
  // Resolução do módulo alvo de um comando
  // ---------------------------------------------------------------
  function resolverModulo(p, ref, criterio, ordenar) {
    if (ref && ref !== 'auto' && ref !== 'selecionado') {
      const m = getModuloPorId(p, ref);
      return m && (!criterio || criterio(m)) ? m : null;
    }
    const sel = getModuloPorId(p, p.selecionado);
    if (sel && (!criterio || criterio(sel))) return sel;
    if (ref === 'selecionado') return null;
    let lista = p.modulos.filter((m) => !criterio || criterio(m));
    if (ordenar) lista = lista.slice().sort(ordenar);
    return lista[0] || null;
  }

  const COMP_CHAVE = { gaveta: 'gavetas', prateleira: 'prateleiras', varao: 'varoes', porta: 'portas' };
  const COMP_NOME = { gaveta: ['gaveta', 'gavetas'], prateleira: ['prateleira', 'prateleiras'], varao: ['varão', 'varões'], porta: ['porta', 'portas'] };
  const COMP_MAX = { gaveta: 6, prateleira: 10, varao: 2, porta: 2 };

  function alterarComponente(p, c, comp, modo) {
    const chave = COMP_CHAVE[comp];
    const suportaComp = (m) => C.suporta(m, comp);
    const preferidos = (m) => suportaComp(m) && (modo !== 'remove' || (m.componentes[chave] || 0) > 0);
    const sel = getModuloPorId(p, p.selecionado);
    const explicito = c.id && c.id !== 'auto';
    if (explicito || (sel && preferidos(sel))) {
      const m = resolverModulo(p, c.id || 'auto', preferidos);
      if (!m) {
        if (c.id === 'selecionado' && !p.selecionado) return falha('Selecione primeiro um módulo no 3D (clique sobre ele).');
        return falha(`O módulo selecionado não aceita ${COMP_NOME[comp][1]}.`);
      }
      return alterarComponenteEm(p, m, c, comp, modo);
    }
    // alvo automático: tenta os candidatos por ordem até um aceitar
    const ordenar = modo === 'remove'
      ? (a, b) => (b.componentes[chave] || 0) - (a.componentes[chave] || 0)
      : (a, b) => (a.componentes[chave] || 0) - (b.componentes[chave] || 0);
    const candidatos = p.modulos.filter(preferidos).sort(ordenar);
    if (!candidatos.length) return falha(`Nenhum módulo do projeto aceita ${COMP_NOME[comp][1]}.`);
    let ultimo = null;
    for (const m of candidatos) {
      const r = alterarComponenteEm(p, m, c, comp, modo);
      if (r.ok && r.alteracoes.length) return r;
      ultimo = r;
    }
    return ultimo;
  }

  function alterarComponenteEm(p, m, c, comp, modo) {
    const chave = COMP_CHAVE[comp];
    const qtd = Math.max(0, Math.round(num(c.quantidade) ?? 1));
    const antes = m.componentes[chave] || 0;
    let depois;
    if (modo === 'set') depois = qtd;
    else if (modo === 'add') depois = antes + qtd;
    else depois = Math.max(0, antes - qtd);

    let maximo = COMP_MAX[comp];
    if (comp === 'gaveta' && m.zona === 'base') maximo = Math.max(1, Math.floor((m.dimensoes.altura - 12) / 14));
    if (comp === 'porta' && m.tipo === 'roupeiro' && m.componentes.tipoPorta === 'correr') maximo = 1;
    depois = clamp(depois, 0, maximo);

    const anterior = C.clone(m.componentes);
    m.componentes[chave] = depois;
    if (comp === 'gaveta' && m.tipo === 'inferior' && depois > 0 && (m.componentes.portas || 0) === 0 && depois < 2) m.componentes.portas = 1;
    if (m.tipo === 'roupeiro') {
      let lay = C.layoutRoupeiro(m);
      if (!lay.cabe && modo !== 'remove') {
        // tenta libertar espaço retirando prateleiras extra
        while (!lay.cabe && comp !== 'prateleira' && m.componentes.prateleiras > 0) {
          m.componentes.prateleiras -= 1;
          lay = C.layoutRoupeiro(m);
        }
        if (!lay.cabe) {
          m.componentes = anterior;
          return falha(`Não há altura suficiente em "${m.nome}" para mais ${COMP_NOME[comp][1]}.`);
        }
      }
    }
    if (m.nomeAuto) m.nome = C.nomeAutomatico(m);
    const diff = depois - antes;
    p.layoutManual = true;
    if (diff === 0) {
      return ok(`"${m.nome}" mantém ${depois} ${COMP_NOME[comp][depois === 1 ? 0 : 1]} (limite deste módulo).`, [], { moduloId: m.id });
    }
    const verbo = diff > 0 ? 'Adicionei' : 'Retirei';
    const n = Math.abs(diff);
    return ok(`${verbo} ${n} ${COMP_NOME[comp][n === 1 ? 0 : 1]} ${diff > 0 ? 'a' : 'de'} "${m.nome}" (agora ${depois}).`, ['modulos'], { moduloId: m.id, selecionar: m.id });
  }

  function aplicarAlturaTotal(p, ateTeto) {
    const H = p.espaco.altura;
    let n = 0;
    p.modulos.forEach((m) => {
      const lim = C.limites(m);
      const d = C.getModulo(m.catalogoId);
      if (m.zona === 'alto' || m.tipo === 'roupeiro') {
        m.dimensoes.altura = ateTeto ? clamp(H, lim.alturaMin, lim.alturaMax) : Math.min(d.altura, H - 10);
        n += 1;
      } else if (m.zona === 'superior') {
        m.dimensoes.altura = ateTeto ? clamp(H - m.posicao.y, lim.alturaMin, lim.alturaMax) : Math.min(72, H - m.posicao.y);
        n += 1;
      }
      if (m.tipo === 'roupeiro') {
        m.componentes.maleiro = m.dimensoes.altura >= 200 && (m.componentes.maleiro || ateTeto);
      }
    });
    return n;
  }

  // ---------------------------------------------------------------
  // Orçamento
  // ---------------------------------------------------------------
  function calcularOrcamento(p) {
    const P = C.PRECOS;
    let estrutura = 0;
    let frentes = 0;
    let interiores = 0;
    let iluminacao = 0;
    let bancada = 0;
    let eletro = 0;
    p.modulos.forEach((m) => {
      const pr = C.precoModulo(m, p);
      estrutura += pr.estrutura;
      frentes += pr.frentes;
      interiores += pr.interiores;
      iluminacao += pr.iluminacao;
      if (p.preferencias.bancada !== false && COM_BANCADA.includes(m.tipo)) bancada += (m.dimensoes.largura / 100) * P.bancadaPorMetro;
      if (m.tipo === 'ilha') bancada += (m.dimensoes.largura / 100) * P.bancadaPorMetro * 1.6;
      const c = m.componentes;
      eletro += ['frigorifico', 'forno', 'lavaLoica', 'microondas', 'exaustor'].filter((k) => c[k]).length * P.integracaoEletro;
    });
    const subtotal = estrutura + frentes + interiores + iluminacao + bancada + eletro;
    const montagem = subtotal * P.montagem;
    const total = subtotal + montagem;
    return {
      linhas: [
        { rotulo: 'Estrutura dos módulos', valor: estrutura },
        { rotulo: 'Portas e gavetas', valor: frentes },
        { rotulo: 'Interiores e acessórios', valor: interiores },
        { rotulo: 'Bancada', valor: bancada },
        { rotulo: 'Iluminação', valor: iluminacao },
        { rotulo: 'Integração de eletrodomésticos', valor: eletro },
        { rotulo: 'Montagem', valor: montagem }
      ].filter((l) => l.valor > 0 || ['Estrutura dos módulos', 'Montagem'].includes(l.rotulo)),
      total
    };
  }

  // ---------------------------------------------------------------
  // Normalização de comandos (aceita português ou inglês)
  // ---------------------------------------------------------------
  const ALIAS_CAMPOS = { width: 'largura', height: 'altura', depth: 'profundidade', finish: 'acabamento', type: 'tipo', quantity: 'quantidade', count: 'quantidade', module: 'modulo', style: 'estilo', appliance: 'aparelho', value: 'valor' };

  function normalizarComando(c) {
    const out = {};
    Object.keys(c || {}).forEach((k) => {
      out[ALIAS_CAMPOS[k] || k] = c[k];
    });
    out.action = out.action || out.acao || out.comando;
    if (out.modulo && typeof out.modulo === 'object') {
      const m = {};
      Object.keys(out.modulo).forEach((k) => {
        m[ALIAS_CAMPOS[k] || k] = out.modulo[k];
      });
      out.modulo = m;
    }
    return out;
  }

  // medidas de módulos vindas em mm (ex.: 600) passam a cm
  function cmModulo(v, unidade) {
    const n = num(v);
    if (n === null) return null;
    if (unidade === 'mm' || n > 400) return n / 10;
    return n;
  }

  function cmEspaco(v, unidade) {
    const n = num(v);
    if (n === null) return null;
    if (unidade === 'mm' || n > 2000) return n / 10;
    if (unidade === 'm' || n <= 12) return n * 100;
    return n;
  }

  const TIPO_PARA_CATALOGO = {
    gaveteiro: 'gaveteiro-60',
    gavetas: 'gaveteiro-60',
    inferior: 'inferior-60',
    'armario inferior': 'inferior-60',
    superior: 'superior-60',
    'armario superior': 'superior-60',
    coluna: 'coluna-60',
    despenseiro: 'coluna-60',
    'coluna-forno': 'coluna-forno-60',
    forno: 'forno-60',
    pia: 'pia-80',
    'lava-loica': 'lava-loica-60',
    frigorifico: 'frigorifico-70',
    exaustor: 'exaustor-60',
    ilha: 'ilha-180',
    roupeiro: 'roupeiro-cabides-90',
    cabides: 'roupeiro-cabides-90',
    sapateira: 'roupeiro-sapateira-60',
    prateleiras: 'roupeiro-prateleiras-60',
    estante: 'estante-90',
    'movel-tv': 'movel-tv-180',
    secretaria: 'secretaria-140',
    'mesa-cabeceira': 'mesa-cabeceira-50',
    aparador: 'aparador-140',
    bloco: 'bloco-60'
  };

  // ---------------------------------------------------------------
  // Comandos
  // ---------------------------------------------------------------
  const COMANDOS = {
    set_room_type(p, c) {
      const tipo = c.tipo || c.valor;
      if (!C.AMBIENTES[tipo]) return falha('Tipo de ambiente desconhecido.');
      const mudou = p.tipo !== tipo;
      p.tipo = tipo;
      if (tipo === 'roupeiro' && mudou && p.espaco.profundidade < 250) p.espaco.profundidade = 300;
      atualizarParedes(p);
      if (mudou) {
        p.janelas = [];
        p.portas = [];
      }
      if (c.gerar !== false) gerarLayout(p);
      return ok(`Ambiente definido como ${C.AMBIENTES[tipo].toLowerCase()}.`, ['tipo', 'espaco', 'modulos']);
    },

    set_room_dimensions(p, c) {
      const e = p.espaco;
      const lim = { largura: [100, 1200], profundidade: [100, 1000], altura: [200, 400] };
      const mudancas = [];
      ['largura', 'profundidade', 'altura'].forEach((k) => {
        const v = cmEspaco(c[k], c.unidade);
        if (v === null) return;
        const final = Math.round(clamp(v, lim[k][0], lim[k][1]));
        if (final !== e[k]) mudancas.push(`${k} ${final} cm`);
        e[k] = final;
      });
      atualizarParedes(p);
      p.janelas.forEach((j) => {
        const comp = comprimentoParede(p, j.parede);
        j.posicao = clamp(j.posicao, j.largura / 2 + 5, comp - j.largura / 2 - 5);
      });
      let aviso = '';
      if (p.modulos.length && !p.layoutManual && c.gerar !== false) gerarLayout(p);
      else {
        aviso = ajustarAoEspaco(p);
        // gerar:false → um generate_layout vem a seguir; sobreposições temporárias não interessam
        if (c.gerar === false) aviso = '';
      }
      if (!mudancas.length) return ok('', ['espaco']);
      return ok(`Ambiente atualizado: ${mudancas.join(', ')}.${aviso ? ' ' + aviso : ''}`, ['espaco', 'modulos']);
    },

    set_preference(p, c) {
      if (!(c.chave in p.preferencias)) return falha(`Preferência desconhecida: ${c.chave}`);
      p.preferencias[c.chave] = c.valor;
      return ok('', ['preferencias']);
    },

    set_preferences(p, c) {
      Object.keys(c.valores || {}).forEach((k) => {
        if (k in p.preferencias) p.preferencias[k] = c.valores[k];
      });
      return ok('', ['preferencias']);
    },

    set_window(p, c) {
      if (!c.posicao || c.posicao === 'nenhuma') {
        p.janelas = [];
        return ok('', ['aberturas']);
      }
      const parede = c.parede || 'fundo';
      const comp = comprimentoParede(p, parede);
      const largura = num(c.largura) || Math.min(120, comp * 0.4);
      const mapa = { esquerda: 0.27, centro: 0.5, meio: 0.5, direita: 0.73 };
      const pos = typeof c.posicao === 'number' ? c.posicao : comp * (mapa[c.posicao] || 0.5);
      p.janelas = [{ id: 'janela-1', parede, posicao: r1(clamp(pos, largura / 2 + 5, comp - largura / 2 - 5)), largura, altura: num(c.altura) || 110, peitoril: num(c.peitoril) || 105 }];
      return ok('', ['aberturas']);
    },

    set_entry_door(p, c) {
      const parede = c.parede || 'frente';
      const comp = comprimentoParede(p, parede);
      let pos = num(c.posicao);
      if (pos === null) {
        if (parede === 'esquerda') pos = 60;
        else if (parede === 'direita') pos = comp - 60;
        else pos = comp * 0.5;
      }
      p.portas = [{ id: 'porta-1', parede, posicao: r1(clamp(pos, 45, comp - 45)), largura: 80, altura: 205 }];
      return ok('', ['aberturas']);
    },

    set_appliances(p, c) {
      const lista = (c.lista || []).filter((k) => C.ELETRODOMESTICOS[k]);
      p.eletrodomesticos = Array.from(new Set(lista));
      return ok('', ['eletrodomesticos']);
    },

    add_appliance(p, c) {
      const k = c.aparelho;
      if (!C.ELETRODOMESTICOS[k]) return falha('Eletrodoméstico desconhecido.');
      if (p.tipo !== 'cozinha') return falha('Eletrodomésticos só se aplicam à cozinha.');
      if (!p.eletrodomesticos.includes(k)) p.eletrodomesticos.push(k);
      if (!p.layoutManual) {
        const notas = gerarLayout(p);
        return ok(`Integrei ${C.ELETRODOMESTICOS[k].toLowerCase()} e reorganizei a cozinha.${notas.length ? ' ' + notas.join(' ') : ''}`, ['eletrodomesticos', 'modulos']);
      }
      const mapa = { frigorifico: 'frigorifico-70', forno: 'coluna-forno-60', microondas: 'coluna-forno-60', lavaLoica: 'lava-loica-60', exaustor: 'exaustor-60', placa: 'placa-60' };
      return COMANDOS.add_module(p, { catalogoId: mapa[k] });
    },

    remove_appliance(p, c) {
      const k = c.aparelho;
      p.eletrodomesticos = p.eletrodomesticos.filter((e) => e !== k);
      if (!p.layoutManual) {
        gerarLayout(p);
        return ok(`Retirei ${C.ELETRODOMESTICOS[k] ? C.ELETRODOMESTICOS[k].toLowerCase() : k} e reorganizei a cozinha.`, ['eletrodomesticos', 'modulos']);
      }
      const tipos = { frigorifico: ['frigorifico'], lavaLoica: ['lava-loica'], forno: ['coluna-forno', 'forno'], microondas: ['coluna-forno'], exaustor: ['exaustor'] }[k] || [];
      const antes = p.modulos.length;
      p.modulos = p.modulos.filter((m) => !tipos.includes(m.tipo));
      if (!p.modulos.find((m) => m.id === p.selecionado)) p.selecionado = null;
      return ok(`Retirei ${antes - p.modulos.length} módulo(s) de ${C.ELETRODOMESTICOS[k] || k}.`, ['modulos']);
    },

    swap_fridge_side(p) {
      p.preferencias.ladoFrigorifico = p.preferencias.ladoFrigorifico === 'direita' ? 'esquerda' : 'direita';
      if (!p.layoutManual) {
        gerarLayout(p);
      } else {
        // espelha a parede de fundo mantendo as edições
        p.modulos.forEach((m) => {
          if (m.parede === 'fundo') m.posicao.x = -m.posicao.x;
        });
        ['agua', 'gas', 'eletrica'].forEach((k) => p.pontos[k].forEach((pt) => { if (pt.parede === 'fundo') pt.posicao = p.espaco.largura - pt.posicao; }));
      }
      return ok(`Passei o frigorífico para o lado ${p.preferencias.ladoFrigorifico === 'direita' ? 'direito' : 'esquerdo'}.`, ['modulos']);
    },

    generate_layout(p) {
      const notas = gerarLayout(p);
      return ok(notas.join(' '), ['modulos'], { gerado: true });
    },

    add_module(p, c) {
      let catalogoId = c.catalogoId;
      if (!catalogoId && c.modulo) {
        const t = String(c.modulo.tipo || c.modulo.catalogoId || '').toLowerCase();
        catalogoId = C.getModulo(t) ? t : TIPO_PARA_CATALOGO[t];
      }
      if (!catalogoId && c.tipo) catalogoId = TIPO_PARA_CATALOGO[String(c.tipo).toLowerCase()];
      const d = C.getModulo(catalogoId);
      if (!d) return falha('Não encontrei esse módulo no catálogo.');
      const m = preparar(p, catalogoId);
      const extra = c.modulo || c;
      const lim = d.compatibilidade;
      const L = cmModulo(extra.largura, extra.unidade);
      const A = cmModulo(extra.altura, extra.unidade);
      const P = cmModulo(extra.profundidade, extra.unidade);
      if (L) m.dimensoes.largura = clamp(L, lim.larguraMin, lim.larguraMax);
      if (A) m.dimensoes.altura = clamp(A, lim.alturaMin, lim.alturaMax);
      if (P) m.dimensoes.profundidade = clamp(P, lim.profundidadeMin, lim.profundidadeMax);
      if (m.zona === 'alto' || m.tipo === 'roupeiro') m.dimensoes.altura = Math.min(m.dimensoes.altura, p.espaco.altura - (p.preferencias.ateTeto ? 0 : 5));
      if (p.preferencias.ateTeto && (m.zona === 'alto' || m.tipo === 'roupeiro')) m.dimensoes.altura = clamp(p.espaco.altura, lim.alturaMin, lim.alturaMax);
      if (m.zona === 'superior') m.dimensoes.altura = Math.min(m.dimensoes.altura, p.espaco.altura - m.posicao.y);
      if (c.parede !== undefined) m.parede = c.parede;
      m.nome = C.nomeAutomatico(m);

      let r;
      if (c.posicao) r = posicaoLivre(p, m, cmModulo(c.posicao.x) || 0, cmModulo(c.posicao.z) || 0);
      else if (m.parede) r = colocarNaParede(p, m);
      else r = posicaoLivre(p, m, 0, 0);
      if (!r) return falha(`Não há espaço livre para "${m.nome}". Liberte espaço ou aumente o ambiente.`);
      m.posicao.x = r.x;
      m.posicao.z = r.z;
      p.modulos.push(m);
      p.selecionado = m.id;
      p.layoutManual = true;
      return ok(`Adicionei "${m.nome}".`, ['modulos', 'selecao'], { moduloId: m.id });
    },

    remove_module(p, c) {
      const m = resolverModulo(p, c.id || 'selecionado');
      if (!m) return falha('Selecione o módulo que quer remover.');
      p.modulos = p.modulos.filter((o) => o.id !== m.id);
      if (p.selecionado === m.id) p.selecionado = null;
      if (m.tipo === 'ilha') p.preferencias.ilha = false;
      p.layoutManual = true;
      return ok(`Removi "${m.nome}".`, ['modulos', 'selecao']);
    },

    move_module(p, c) {
      const m = resolverModulo(p, c.id || 'selecionado');
      if (!m) return falha('Selecione o módulo que quer mover.');
      const x = num(c.x) !== null ? num(c.x) : m.posicao.x + (num(c.dx) || 0);
      const z = num(c.z) !== null ? num(c.z) : m.posicao.z + (num(c.dz) || 0);
      const r = posicaoLivre(p, m, x, z);
      if (!r) return falha('Não há posição livre nesse sentido.');
      const moveu = Math.abs(r.x - m.posicao.x) > 0.05 || Math.abs(r.z - m.posicao.z) > 0.05;
      m.posicao.x = r.x;
      m.posicao.z = r.z;
      if (moveu) p.layoutManual = true;
      return ok(moveu ? `Movi "${m.nome}".` : `"${m.nome}" já está no limite possível.`, ['modulos']);
    },

    resize_module(p, c) {
      const m = resolverModulo(p, c.id || 'selecionado');
      if (!m) return falha('Selecione o módulo que quer redimensionar.');
      const lim = C.limites(m);
      const antes = C.clone(m.dimensoes);
      const L = num(c.largura) !== null ? cmModulo(c.largura, c.unidade) : num(c.dLargura) !== null ? m.dimensoes.largura + num(c.dLargura) : null;
      const A = num(c.altura) !== null ? cmModulo(c.altura, c.unidade) : num(c.dAltura) !== null ? m.dimensoes.altura + num(c.dAltura) : null;
      const P = num(c.profundidade) !== null ? cmModulo(c.profundidade, c.unidade) : null;
      const avisos = [];
      if (L !== null) {
        m.dimensoes.largura = r1(clamp(L, lim.larguraMin, lim.larguraMax));
        if (m.dimensoes.largura !== r1(L)) avisos.push(`largura limitada a ${m.dimensoes.largura} cm`);
      }
      if (A !== null) {
        const maxAlt = Math.min(lim.alturaMax, p.espaco.altura - (m.posicao.y || 0));
        m.dimensoes.altura = r1(clamp(A, lim.alturaMin, maxAlt));
        if (m.dimensoes.altura !== r1(A)) avisos.push(`altura limitada a ${m.dimensoes.altura} cm`);
      }
      if (P !== null) m.dimensoes.profundidade = r1(clamp(P, lim.profundidadeMin, lim.profundidadeMax));
      if (['inferior', 'superior', 'pia', 'coluna', 'bloco', 'aparador'].includes(m.tipo)) m.componentes.portas = m.dimensoes.largura > 60 ? 2 : 1;
      if (m.tipo === 'roupeiro' && m.componentes.tipoPorta === 'abrir') m.componentes.portas = m.dimensoes.largura >= 70 ? 2 : 1;
      if (m.tipo === 'roupeiro') {
        let lay = C.layoutRoupeiro(m);
        while (!lay.cabe && (m.componentes.prateleiras > 0 || m.componentes.gavetas > 0)) {
          if (m.componentes.prateleiras > 0) m.componentes.prateleiras -= 1;
          else m.componentes.gavetas -= 1;
          lay = C.layoutRoupeiro(m);
        }
      }
      const r = posicaoLivre(p, m, m.posicao.x, m.posicao.z);
      if (!r) {
        m.dimensoes = antes;
        return falha('Com essa medida o módulo não cabe sem sobrepor outros.');
      }
      m.posicao.x = r.x;
      m.posicao.z = r.z;
      if (m.nomeAuto) m.nome = C.nomeAutomatico(m);
      p.layoutManual = true;
      const d = m.dimensoes;
      return ok(`"${m.nome}" agora mede ${d.largura} × ${d.altura} × ${d.profundidade} cm${avisos.length ? ' (' + avisos.join(', ') + ')' : ''}.`, ['modulos']);
    },

    rotate_module(p, c) {
      const m = resolverModulo(p, c.id || 'selecionado');
      if (!m) return falha('Selecione o módulo que quer rodar.');
      if (m.parede) return falha(`"${m.nome}" está encostado à parede; só módulos livres (como a ilha) podem rodar.`);
      const antes = m.rotacao;
      m.rotacao = num(c.graus) !== null && c.absoluto ? num(c.graus) : (m.rotacao + (num(c.graus) ?? 90)) % 360;
      const r = posicaoLivre(p, m, m.posicao.x, m.posicao.z);
      if (!r) {
        m.rotacao = antes;
        return falha('Rodado, o módulo não cabe nesta posição.');
      }
      m.posicao.x = r.x;
      m.posicao.z = r.z;
      p.layoutManual = true;
      return ok(`Rodei "${m.nome}" para ${Math.round(m.rotacao)}°.`, ['modulos']);
    },

    duplicate_module(p, c) {
      const m = resolverModulo(p, c.id || 'selecionado');
      if (!m) return falha('Selecione o módulo que quer duplicar.');
      const copia = C.clone(m);
      copia.id = C.criarModulo(m.catalogoId).id;
      const r = m.parede ? colocarNaParede(p, copia) : posicaoLivre(p, copia, m.posicao.x + m.dimensoes.largura, m.posicao.z);
      if (!r) return falha('Não há espaço livre para a cópia.');
      copia.posicao.x = r.x;
      copia.posicao.z = r.z;
      p.modulos.push(copia);
      p.selecionado = copia.id;
      p.layoutManual = true;
      return ok(`Dupliquei "${m.nome}".`, ['modulos', 'selecao']);
    },

    change_material(p, c) {
      const v = c.material || c.valor;
      if (!C.MATERIAIS[v]) return falha('Material desconhecido.');
      p.material = v;
      p.modulos.forEach((m) => { m.material = v; });
      return ok(`Material alterado para ${C.MATERIAIS[v].nome}.`, ['material']);
    },

    change_finish(p, c) {
      const v = c.acabamento || c.valor;
      if (!C.ACABAMENTOS[v]) return falha('Acabamento desconhecido.');
      p.acabamento = v;
      p.modulos.forEach((m) => { m.acabamento = v; });
      return ok(`Acabamento alterado para ${v}.`, ['acabamento']);
    },

    change_style(p, c) {
      const v = c.estilo || c.valor;
      if (!C.ESTILOS[v]) return falha('Estilo desconhecido.');
      p.estilo = v;
      return ok(`Estilo ${C.ESTILOS[v].nome.toLowerCase()} aplicado (puxadores e detalhes).`, ['estilo']);
    },

    add_shelf: (p, c) => alterarComponente(p, c, 'prateleira', 'add'),
    remove_shelf: (p, c) => alterarComponente(p, c, 'prateleira', 'remove'),
    set_shelves: (p, c) => alterarComponente(p, c, 'prateleira', 'set'),
    add_drawer: (p, c) => alterarComponente(p, c, 'gaveta', 'add'),
    remove_drawer: (p, c) => alterarComponente(p, c, 'gaveta', 'remove'),
    set_drawers: (p, c) => alterarComponente(p, c, 'gaveta', 'set'),
    add_rod: (p, c) => alterarComponente(p, c, 'varao', 'add'),
    remove_rod: (p, c) => alterarComponente(p, c, 'varao', 'remove'),
    add_door: (p, c) => alterarComponente(p, c, 'porta', 'add'),
    remove_door: (p, c) => alterarComponente(p, c, 'porta', 'remove'),

    toggle_component(p, c) {
      const comp = c.componente;
      const nomes = { led: 'iluminação LED', espelho: 'espelho', sapateira: 'sapateira', maleiro: 'maleiro' };
      if (!nomes[comp]) return falha('Componente desconhecido.');
      const m = resolverModulo(p, c.id || 'auto', (o) => C.suporta(o, comp));
      if (!m) return falha(`Nenhum módulo selecionado aceita ${nomes[comp]}.`);
      const alvos = c.todos ? p.modulos.filter((o) => C.suporta(o, comp)) : [m];
      const valor = c.valor !== undefined ? !!c.valor : !m.componentes[comp];
      const anteriores = alvos.map((o) => C.clone(o.componentes));
      alvos.forEach((o) => {
        o.componentes[comp] = valor;
        if (o.tipo === 'roupeiro') {
          let lay = C.layoutRoupeiro(o);
          while (!lay.cabe && o.componentes.prateleiras > 0) {
            o.componentes.prateleiras -= 1;
            lay = C.layoutRoupeiro(o);
          }
          if (!lay.cabe) o.componentes = anteriores[alvos.indexOf(o)];
        }
        if (o.nomeAuto) o.nome = C.nomeAutomatico(o);
      });
      if (comp === 'led' || comp === 'espelho' || comp === 'maleiro' || comp === 'sapateira') {
        if (c.todos) p.preferencias[comp === 'sapateira' ? 'sapatos' : comp] = valor;
      }
      p.layoutManual = true;
      const onde = alvos.length > 1 ? `em ${alvos.length} módulos` : `em "${m.nome}"`;
      return ok(`${valor ? 'Adicionei' : 'Retirei'} ${nomes[comp]} ${onde}.`, ['modulos'], { selecionar: alvos.length === 1 ? m.id : null });
    },

    add_island(p) {
      if (p.tipo !== 'cozinha') return falha('A ilha só está disponível na cozinha.');
      if (p.modulos.some((m) => m.tipo === 'ilha')) return ok('O projeto já tem uma ilha.', []);
      const r = criarIlha(p, p.modulos);
      if (!r.modulo) return falha(r.nota);
      p.modulos.push(r.modulo);
      p.preferencias.ilha = true;
      p.selecionado = r.modulo.id;
      return ok(`Adicionei uma ilha de ${r.modulo.dimensoes.largura} cm com gavetas.`, ['modulos', 'selecao']);
    },

    remove_island(p) {
      const antes = p.modulos.length;
      p.modulos = p.modulos.filter((m) => m.tipo !== 'ilha');
      p.preferencias.ilha = false;
      if (!p.modulos.find((m) => m.id === p.selecionado)) p.selecionado = null;
      return ok(antes === p.modulos.length ? 'O projeto não tinha ilha.' : 'Retirei a ilha.', ['modulos']);
    },

    set_full_height(p, c) {
      const ateTeto = c.valor !== false;
      p.preferencias.ateTeto = ateTeto;
      const n = aplicarAlturaTotal(p, ateTeto);
      return ok(n ? (ateTeto ? `Levei ${n} módulo(s) até ao teto (${p.espaco.altura} cm).` : `Repus a altura padrão em ${n} módulo(s).`) : 'Não há módulos altos para ajustar.', ['modulos']);
    },

    adjust_height(p, c) {
      const delta = num(c.delta) || 20;
      let alvos;
      if (c.alvo === 'roupeiro') alvos = p.modulos.filter((m) => m.tipo === 'roupeiro');
      else if (c.alvo === 'altos') alvos = p.modulos.filter((m) => m.zona === 'alto' || m.zona === 'superior');
      else {
        const m = resolverModulo(p, 'selecionado');
        alvos = m ? [m] : [];
      }
      if (!alvos.length) return falha('Selecione o módulo cuja altura quer alterar.');
      const alturasAntes = alvos.map((m) => m.dimensoes.altura);
      alvos.forEach((m) => {
        const lim = C.limites(m);
        m.dimensoes.altura = r1(clamp(m.dimensoes.altura + delta, lim.alturaMin, Math.min(lim.alturaMax, p.espaco.altura - (m.posicao.y || 0))));
        if (m.tipo === 'roupeiro') {
          let lay = C.layoutRoupeiro(m);
          while (!lay.cabe && (m.componentes.prateleiras > 0 || m.componentes.gavetas > 0)) {
            if (m.componentes.prateleiras > 0) m.componentes.prateleiras -= 1;
            else m.componentes.gavetas -= 1;
            lay = C.layoutRoupeiro(m);
          }
        }
      });
      if (alvos.every((m, i) => m.dimensoes.altura === alturasAntes[i])) {
        return ok(delta > 0 ? `Já está na altura máxima possível (${alvos[0].dimensoes.altura} cm, limitada pelo teto ou pelo módulo).` : `Já está na altura mínima deste módulo (${alvos[0].dimensoes.altura} cm).`, []);
      }
      p.layoutManual = true;
      return ok(`Altura ajustada para ${alvos[0].dimensoes.altura} cm${alvos.length > 1 ? ` em ${alvos.length} módulos` : ` em "${alvos[0].nome}"`}.`, ['modulos']);
    },

    set_door_type(p, c) {
      const tipo = c.tipoPorta || c.valor;
      if (!['abrir', 'correr', 'nenhuma'].includes(tipo)) return falha('Tipo de porta desconhecido.');
      p.preferencias.tipoPorta = tipo;
      const roupeiros = p.modulos.filter((m) => m.tipo === 'roupeiro').sort((a, b) => a.posicao.x - b.posicao.x);
      if (!roupeiros.length) return falha('Não há módulos de roupeiro para alterar as portas.');
      roupeiros.forEach((m, i) => {
        m.componentes.tipoPorta = tipo;
        m.componentes.portas = tipo === 'nenhuma' ? 0 : tipo === 'correr' ? 1 : m.dimensoes.largura >= 70 ? 2 : 1;
        m.componentes.trilho = i % 2;
        if (tipo === 'nenhuma') m.componentes.espelho = false;
      });
      p.layoutManual = true;
      const nome = { abrir: 'portas de abrir', correr: 'portas de correr', nenhuma: 'sem portas (roupeiro aberto)' }[tipo];
      return ok(`Roupeiro alterado para ${nome}.`, ['modulos']);
    },

    select_module(p, c) {
      const id = c.id && getModuloPorId(p, c.id) ? c.id : null;
      p.selecionado = id;
      return ok('', ['selecao']);
    },

    set_notes(p, c) {
      const texto = String(c.texto || '').trim();
      if (texto) p.observacoes = p.observacoes ? `${p.observacoes} ${texto}` : texto;
      return ok('', ['observacoes']);
    },

    set_state(p, c) {
      p.estado = c.estado || p.estado;
      return ok('', ['estado']);
    },

    update_conversation(p, c) {
      if (c.reiniciar) {
        p.conversa.respondidos = {};
        p.conversa.concluida = false;
        p.estado = 'em_configuracao';
      }
      (c.respondidos || []).forEach((k) => { p.conversa.respondidos[k] = true; });
      if (c.perguntaAtual !== undefined) p.conversa.perguntaAtual = c.perguntaAtual;
      if (c.concluida !== undefined) p.conversa.concluida = !!c.concluida;
      return ok('', ['conversa']);
    },

    chat_message(p, c) {
      p.conversa.historico.push({ autor: c.autor || 'ia', texto: String(c.texto || ''), opcoes: c.opcoes || null });
      if (p.conversa.historico.length > 80) p.conversa.historico.splice(0, p.conversa.historico.length - 80);
      return ok('', ['conversa']);
    },

    load_preset(p, c) {
      const lista = C.PRESETS[p.tipo] || [];
      const preset = Object.values(C.PRESETS).flat().find((pr) => pr.id === c.id) || lista[0];
      if (!preset) return falha('Projeto pronto não encontrado.');
      p.tipo = preset.tipo;
      Object.assign(p.espaco, preset.espaco || {});
      atualizarParedes(p);
      p.preferencias = Object.assign(C.clone(PREFERENCIAS_PADRAO), preset.preferencias || {});
      if (preset.eletrodomesticos) p.eletrodomesticos = preset.eletrodomesticos.slice();
      p.janelas = [];
      p.portas = [];
      const notas = gerarLayout(p);
      return ok(`Carreguei "${preset.nome}".${notas.length ? ' ' + notas.join(' ') : ''}`, ['tipo', 'espaco', 'modulos'], { gerado: true });
    },

    reset_project(p, c) {
      const novo = criarProjetoInicial(c.tipo || 'cozinha');
      Object.keys(p).forEach((k) => delete p[k]);
      Object.assign(p, novo);
      gerarLayout(p);
      return ok('Projeto reiniciado.', ['tudo'], { gerado: true });
    }
  };

  // ---------------------------------------------------------------
  // Loja (subscrição + execução)
  // ---------------------------------------------------------------
  let projeto = criarProjetoInicial();
  const ouvintes = new Set();

  function notificar(alteracoes) {
    ouvintes.forEach((fn) => {
      try {
        fn(projeto, alteracoes);
      } catch (e) {
        console.error('[Novari] erro num ouvinte do projeto:', e);
      }
    });
  }

  function aplicar(comando) {
    const c = normalizarComando(comando);
    const handler = COMANDOS[c.action];
    if (!handler) return falha(`Comando desconhecido: ${c.action}`);
    try {
      const r = handler(projeto, c) || ok();
      r.action = c.action;
      if (r.selecionar !== undefined && r.selecionar !== null) projeto.selecionado = r.selecionar;
      return r;
    } catch (e) {
      console.error('[Novari] falha no comando', c, e);
      return falha('Ocorreu um erro ao aplicar a alteração.');
    }
  }

  function executar(comando) {
    const r = aplicar(comando);
    notificar(r.alteracoes);
    return r;
  }

  function executarVarios(comandos) {
    const resultados = (comandos || []).map(aplicar);
    const alteracoes = Array.from(new Set(resultados.flatMap((r) => r.alteracoes)));
    notificar(alteracoes);
    return resultados;
  }

  function resumoParaIA(p) {
    return {
      tipo: p.tipo,
      espaco: p.espaco,
      janelas: p.janelas,
      portas: p.portas,
      estilo: p.estilo,
      material: p.material,
      acabamento: p.acabamento,
      preferencias: p.preferencias,
      eletrodomesticos: p.eletrodomesticos,
      selecionado: p.selecionado,
      estado: p.estado,
      modulos: p.modulos.map((m) => ({ id: m.id, catalogoId: m.catalogoId, tipo: m.tipo, zona: m.zona, nome: m.nome, parede: m.parede, posicao: m.posicao, rotacao: m.rotacao, dimensoes: m.dimensoes, componentes: m.componentes })),
      orcamentoAproximado: Math.round(calcularOrcamento(p).total)
    };
  }

  // Substitui o projeto atual por um projeto guardado (ex.: vindo do backend).
  // Campos em falta recebem os valores padrão; campos desconhecidos são ignorados.
  function carregar(dados) {
    if (!dados || typeof dados !== 'object') return falha('Projeto inválido.');
    const novo = criarProjetoInicial(C.AMBIENTES[dados.tipo] ? dados.tipo : 'cozinha');
    Object.keys(novo).forEach((k) => {
      if (dados[k] !== undefined && dados[k] !== null) novo[k] = C.clone(dados[k]);
    });
    novo.preferencias = Object.assign(C.clone(PREFERENCIAS_PADRAO), novo.preferencias);
    novo.conversa = Object.assign({ respondidos: {}, perguntaAtual: null, concluida: false, historico: [] }, novo.conversa);
    novo.pontos = Object.assign({ agua: [], gas: [], eletrica: [] }, novo.pontos);
    if (!Array.isArray(novo.modulos)) novo.modulos = [];
    atualizarParedes(novo);
    C.reservarIds(novo.modulos);
    Object.keys(projeto).forEach((k) => delete projeto[k]);
    Object.assign(projeto, novo);
    notificar(['tudo']);
    return ok('Projeto carregado.', ['tudo']);
  }

  // Inicialização: o projeto nunca começa vazio
  gerarLayout(projeto);

  global.NovariProject = {
    obter: () => projeto,
    subscrever(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
    executar,
    executarVarios,
    carregar,
    restringir: (id, x, z) => {
      const m = getModuloPorId(projeto, id);
      return m ? restringir(projeto, m, x, z) : { x, z, valido: false };
    },
    calcularOrcamento,
    resumoParaIA,
    sugestaoPortasRoupeiro,
    comandosDisponiveis: Object.keys(COMANDOS),
    PREFERENCIAS_PADRAO,
    ELETRO_PADRAO,
    // expostos para testes
    _interno: { criarProjetoInicial, gerarLayout, colide, restringir, pegada }
  };
})(typeof window !== 'undefined' ? window : globalThis);
