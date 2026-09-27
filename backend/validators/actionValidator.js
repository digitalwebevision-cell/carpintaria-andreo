/* ============================================================
   Validação de comandos estruturados (vindos da IA ou do frontend).
   1) Validação estática: tipo de comando permitido, tipos e limites
      de cada campo, IDs de módulos existentes, valores de catálogo,
      medidas dentro dos limites do ambiente e do módulo.
   2) Simulação: os comandos válidos são aplicados a uma cópia do
      projeto com o mesmo motor do frontend; os que o motor recusa
      também são rejeitados.
   Os comandos aceites saem no formato que o frontend executa
   ({ action, id, quantidade, … }).
   ============================================================ */
const engine = require('../services/engine');
const { LIMITES_ESPACO } = require('./projectSchema');

const C = engine.Catalogo;

// Comandos que a IA pode pedir. Os restantes (conversa, estado interno)
// são geridos pelo próprio frontend.
const COMANDOS_IA = engine.comandosDisponiveis.filter(
  (c) => !['chat_message', 'update_conversation', 'set_state', 'set_preferences'].includes(c)
);

const MAX_COMANDOS = 25;

// Aliases aceites (inglês → formato do frontend)
const ALIASES = {
  type: 'action',
  acao: 'action',
  comando: 'action',
  moduleId: 'id',
  module_id: 'id',
  modulo_id: 'id',
  moduloId: 'id',
  catalogId: 'catalogoId',
  quantity: 'quantidade',
  count: 'quantidade',
  width: 'largura',
  height: 'altura',
  depth: 'profundidade',
  unit: 'unidade',
  finish: 'acabamento',
  style: 'estilo',
  appliance: 'aparelho',
  component: 'componente',
  value: 'valor',
  degrees: 'graus',
  wall: 'parede',
  doorType: 'tipoPorta',
  key: 'chave',
  text: 'texto',
  list: 'lista'
};

const r1 = (v) => Math.round(v * 10) / 10;
const finito = (v) => typeof v === 'number' && Number.isFinite(v);
const temChave = (obj, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);

// Mesmas conversões de unidades que projectState.js
function cmModulo(v, unidade) {
  if (unidade === 'mm' || v > 400) return v / 10;
  return v;
}
function cmEspaco(v, unidade) {
  if (unidade === 'mm' || v > 2000) return v / 10;
  if (unidade === 'm' || v <= 12) return v * 100;
  return v;
}

function normalizar(bruto) {
  const out = {};
  Object.entries(bruto || {}).forEach(([k, v]) => {
    const chave = ALIASES[k] || k;
    if (out[chave] === undefined) out[chave] = v;
  });
  // números enviados como texto ("60") são aceites
  ['quantidade', 'largura', 'altura', 'profundidade', 'x', 'z', 'dx', 'dz', 'graus', 'delta', 'peitoril'].forEach((k) => {
    if (typeof out[k] === 'string' && out[k].trim() !== '' && !Number.isNaN(Number(out[k]))) out[k] = Number(out[k]);
  });
  return out;
}

/* Regras por campo: devolvem uma mensagem de erro ou null. */
function regrasCampos(projeto) {
  const W = projeto.espaco.largura;
  const D = projeto.espaco.profundidade;
  const idsModulos = new Set((projeto.modulos || []).map((m) => m.id));
  const num = (min, max) => (v) => (finito(v) && v >= min && v <= max ? null : `deve ser um número entre ${min} e ${max}`);
  const de = (lista) => (v) => (lista.includes(v) ? null : `valor inválido (aceites: ${lista.join(', ')})`);
  const deObj = (obj) => (v) => (temChave(obj, v) ? null : `valor inválido (aceites: ${Object.keys(obj).join(', ')})`);

  return {
    id: (v) => (typeof v === 'string' && (v === 'auto' || v === 'selecionado' || idsModulos.has(v)) ? null : `o módulo "${v}" não existe no projeto`),
    catalogoId: (v) => (C.getModulo(v) ? null : `o módulo de catálogo "${v}" não existe`),
    quantidade: (v) => (Number.isInteger(v) && v >= 0 && v <= 10 ? null : 'deve ser um inteiro entre 0 e 10'),
    largura: num(0.1, 12000),
    altura: num(0.1, 4000),
    profundidade: num(0.1, 10000),
    unidade: de(['cm', 'mm', 'm']),
    x: num(-W / 2, W / 2),
    z: num(-D / 2, D / 2),
    dx: num(-W, W),
    dz: num(-D, D),
    graus: num(-360, 360),
    absoluto: (v) => (typeof v === 'boolean' ? null : 'deve ser verdadeiro/falso'),
    material: deObj(C.MATERIAIS),
    acabamento: deObj(C.ACABAMENTOS),
    estilo: deObj(C.ESTILOS),
    aparelho: deObj(C.ELETRODOMESTICOS),
    lista: (v) => (Array.isArray(v) && v.length <= 10 && v.every((k) => temChave(C.ELETRODOMESTICOS, k)) ? null : 'lista de eletrodomésticos inválida'),
    componente: de(['led', 'espelho', 'sapateira', 'maleiro']),
    tipoPorta: de(['abrir', 'correr', 'nenhuma']),
    parede: (v) => (v === null || ['fundo', 'esquerda', 'direita', 'frente'].includes(v) ? null : 'parede inválida'),
    alvo: de(['roupeiro', 'altos', 'selecionado']),
    todos: (v) => (typeof v === 'boolean' ? null : 'deve ser verdadeiro/falso'),
    gerar: (v) => (typeof v === 'boolean' ? null : 'deve ser verdadeiro/falso'),
    chave: (v) => (temChave(engine.PREFERENCIAS_PADRAO, v) ? null : 'preferência desconhecida'),
    texto: (v) => (typeof v === 'string' && v.length <= 1000 ? null : 'texto inválido (máx. 1000 caracteres)'),
    delta: num(-200, 200),
    peitoril: num(0, 300),
    posicao: (v) => {
      if (typeof v === 'string') return ['esquerda', 'centro', 'meio', 'direita', 'nenhuma'].includes(v) ? null : 'posição inválida';
      if (finito(v)) return v >= 0 && v <= Math.max(W, D) ? null : 'posição fora da parede';
      if (v && typeof v === 'object') return finito(v.x) && finito(v.z) && Math.abs(v.x) <= W / 2 && Math.abs(v.z) <= D / 2 ? null : 'posição fora do ambiente';
      return 'posição inválida';
    },
    tipo: (v) => (typeof v === 'string' && v.length <= 40 ? null : 'tipo inválido'),
    valor: (v) => (typeof v === 'boolean' || finito(v) || (typeof v === 'string' && v.length <= 60) ? null : 'valor inválido')
  };
}

// Campos obrigatórios e verificações específicas de cada comando
const ESPECIFICOS = {
  set_room_type: (c) => (temChave(C.AMBIENTES, c.tipo || c.valor) ? null : `tipo de ambiente inválido (aceites: ${Object.keys(C.AMBIENTES).join(', ')})`),
  set_room_dimensions: (c) => {
    const campos = ['largura', 'profundidade', 'altura'].filter((k) => c[k] !== undefined);
    if (!campos.length) return 'indique largura, profundidade ou altura';
    for (const k of campos) {
      const cm = cmEspaco(c[k], c.unidade);
      const [min, max] = LIMITES_ESPACO[k];
      if (cm < min || cm > max) return `${k} do ambiente deve estar entre ${min} e ${max} cm`;
    }
    return null;
  },
  set_preference: (c, p) => {
    if (!temChave(engine.PREFERENCIAS_PADRAO, c.chave)) return 'preferência desconhecida';
    const padrao = engine.PREFERENCIAS_PADRAO[c.chave];
    if (c.valor === null) return padrao === null ? null : 'esta preferência não aceita valor vazio';
    if (padrao === null) return finito(c.valor) && c.valor >= 0 && c.valor <= 50 ? null : 'deve ser um número entre 0 e 50';
    if (typeof padrao !== typeof c.valor) return `valor deve ser do tipo ${typeof padrao}`;
    if (c.chave === 'profundidadeMovel' && (c.valor < 40 || c.valor > 70)) return 'deve estar entre 40 e 70 cm';
    return null;
  },
  add_appliance: (c) => (c.aparelho ? null : 'indique o eletrodoméstico'),
  remove_appliance: (c) => (c.aparelho ? null : 'indique o eletrodoméstico'),
  set_appliances: (c) => (Array.isArray(c.lista) ? null : 'indique a lista de eletrodomésticos'),
  add_module: (c) => {
    if (!c.catalogoId && !c.tipo && !(c.modulo && typeof c.modulo === 'object')) return 'indique o módulo do catálogo (catalogoId)';
    const d = C.getModulo(c.catalogoId);
    if (d) return limitesModulo(d.compatibilidade, c);
    return null;
  },
  resize_module: (c, p) => {
    if (['largura', 'altura', 'profundidade'].every((k) => c[k] === undefined)) return 'indique a nova medida';
    const m = moduloAlvo(c, p);
    if (!m) return null; // o motor decide o alvo (selecionado)
    const d = C.getModulo(m.catalogoId);
    return d ? limitesModulo(d.compatibilidade, c) : null;
  },
  move_module: (c) => (['x', 'z', 'dx', 'dz'].some((k) => c[k] !== undefined) ? null : 'indique a nova posição (x/z ou dx/dz)'),
  change_material: (c) => (temChave(C.MATERIAIS, c.material || c.valor) ? null : 'material inválido'),
  change_finish: (c) => (temChave(C.ACABAMENTOS, c.acabamento || c.valor) ? null : 'acabamento inválido'),
  change_style: (c) => (temChave(C.ESTILOS, c.estilo || c.valor) ? null : 'estilo inválido'),
  toggle_component: (c) => (c.componente ? null : 'indique o componente'),
  set_door_type: (c) => (['abrir', 'correr', 'nenhuma'].includes(c.tipoPorta || c.valor) ? null : 'tipo de porta inválido'),
  set_notes: (c) => (typeof c.texto === 'string' && c.texto.trim() ? null : 'indique o texto'),
  load_preset: (c) => (Object.values(C.PRESETS).flat().some((pr) => pr.id === c.id) ? null : 'projeto pronto inexistente')
};

function moduloAlvo(c, p) {
  if (!c.id || c.id === 'auto') return null;
  if (c.id === 'selecionado') return (p.modulos || []).find((m) => m.id === p.selecionado) || null;
  return (p.modulos || []).find((m) => m.id === c.id) || null;
}

function limitesModulo(lim, c) {
  const pares = [
    ['largura', lim.larguraMin, lim.larguraMax],
    ['altura', lim.alturaMin, lim.alturaMax],
    ['profundidade', lim.profundidadeMin, lim.profundidadeMax]
  ];
  for (const [k, min, max] of pares) {
    if (c[k] === undefined) continue;
    const cm = cmModulo(c[k], c.unidade);
    if (cm < min || cm > max) return `${k} deste módulo deve estar entre ${min} e ${max} cm (pedido: ${r1(cm)} cm)`;
  }
  return null;
}

/**
 * Valida uma lista de comandos contra o projeto.
 * @returns {{ aceites: object[], rejeitados: {indice, action, motivo}[], simulacao: object|null }}
 */
function validarComandos(comandos, projeto, opcoes = {}) {
  const permitidos = opcoes.permitidos || COMANDOS_IA;
  const regras = regrasCampos(projeto);
  const aceites = [];
  const rejeitados = [];
  const indices = [];

  if (!Array.isArray(comandos)) return { aceites, rejeitados: [{ indice: -1, action: null, motivo: 'A lista de comandos é inválida.' }], simulacao: null };

  comandos.slice(0, MAX_COMANDOS).forEach((bruto, indice) => {
    const c = normalizar(bruto && typeof bruto === 'object' ? bruto : {});
    const rejeitar = (motivo) => rejeitados.push({ indice, action: c.action || null, motivo });

    if (typeof c.action !== 'string' || !permitidos.includes(c.action)) return rejeitar(`Comando desconhecido ou não permitido: ${c.action}.`);

    const limpo = { action: c.action };
    for (const [campo, valor] of Object.entries(c)) {
      if (campo === 'action' || valor === undefined) continue;
      if (campo === 'modulo' && c.action === 'add_module' && valor && typeof valor === 'object') {
        limpo.modulo = { tipo: typeof valor.tipo === 'string' ? valor.tipo.slice(0, 40) : undefined, catalogoId: typeof valor.catalogoId === 'string' ? valor.catalogoId : undefined };
        continue;
      }
      // em load_preset o "id" é o do projeto pronto (verificado em ESPECIFICOS)
      const regra = campo === 'id' && c.action === 'load_preset' ? regras.tipo : regras[campo];
      if (!regra) continue; // campos desconhecidos são descartados
      if (valor === null && campo !== 'parede') continue;
      const erro = regra(valor);
      if (erro) return rejeitar(`Campo "${campo}": ${erro}.`);
      limpo[campo] = valor;
    }
    const especifico = ESPECIFICOS[c.action];
    const erro = especifico ? especifico(limpo, projeto) : null;
    if (erro) return rejeitar(erro.charAt(0).toUpperCase() + erro.slice(1) + '.');
    aceites.push(limpo);
    indices.push(indice);
  });

  if (comandos.length > MAX_COMANDOS) {
    rejeitados.push({ indice: MAX_COMANDOS, action: null, motivo: `Máximo de ${MAX_COMANDOS} comandos por pedido.` });
  }

  if (!aceites.length || opcoes.simular === false) return { aceites, rejeitados, simulacao: null };

  // Simulação com o motor real: comandos que o motor recusa também saem
  const sim = engine.simular(projeto, aceites);
  const finais = [];
  sim.resultados.forEach((r, i) => {
    if (r.ok) finais.push(aceites[i]);
    else rejeitados.push({ indice: indices[i], action: aceites[i].action, motivo: r.mensagem || 'O comando não pôde ser aplicado.' });
  });
  rejeitados.sort((a, b) => a.indice - b.indice);

  return {
    aceites: finais,
    rejeitados,
    simulacao: sim.projeto
      ? { modulos: sim.projeto.modulos.length, orcamentoAproximado: Math.round(engine.calcularOrcamento(sim.projeto).total) }
      : null
  };
}

module.exports = { validarComandos, COMANDOS_IA, MAX_COMANDOS };
