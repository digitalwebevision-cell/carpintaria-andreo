/* ============================================================
   Motor partilhado com o frontend.
   Carrega furnitureCatalog.js e projectState.js (os mesmos ficheiros
   que o navegador usa) numa sandbox "vm" isolada. Assim o backend
   calcula o orçamento e valida comandos com exatamente as mesmas
   regras do planejador, sem duplicar código.
   ============================================================ */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const config = require('../config');
const { clone } = require('../utils/helpers');

const FICHEIROS = ['furnitureCatalog.js', 'projectState.js'];

const scripts = FICHEIROS.map((f) => {
  const caminho = path.join(config.frontendDir, f);
  return new vm.Script(fs.readFileSync(caminho, 'utf8'), { filename: caminho });
});

// Erros internos do motor não devem poluir os logs do servidor
const consoleSilencioso = { log() {}, info() {}, warn() {}, error() {}, debug() {} };

function criarContexto() {
  const sandbox = { console: consoleSilencioso };
  vm.createContext(sandbox);
  scripts.forEach((s) => s.runInContext(sandbox, { timeout: 1000 }));
  return { catalogo: sandbox.NovariCatalog, projeto: sandbox.NovariProject };
}

// Contexto partilhado apenas para funções puras (catálogo, orçamento)
const partilhado = criarContexto();

const Catalogo = partilhado.catalogo;
const Projeto = partilhado.projeto;

/**
 * Aplica comandos a uma cópia do projeto num contexto novo (o projeto
 * original nunca é alterado). Devolve o resultado de cada comando e o
 * projeto resultante.
 */
function simular(projeto, comandos) {
  const ctx = criarContexto();
  const carregado = ctx.projeto.carregar(clone(projeto));
  if (!carregado.ok) return { ok: false, resultados: [], projeto: null };
  const resultados = ctx.projeto.executarVarios(clone(comandos));
  return {
    ok: true,
    resultados: clone(resultados),
    projeto: clone(ctx.projeto.obter())
  };
}

/** Normaliza um projeto (preenche valores padrão, recalcula paredes). */
function normalizar(projeto) {
  const ctx = criarContexto();
  ctx.projeto.carregar(clone(projeto));
  return clone(ctx.projeto.obter());
}

module.exports = {
  Catalogo,
  Projeto,
  simular,
  normalizar,
  calcularOrcamento: (projeto) => clone(Projeto.calcularOrcamento(projeto)),
  comandosDisponiveis: clone(Projeto.comandosDisponiveis),
  PREFERENCIAS_PADRAO: clone(Projeto.PREFERENCIAS_PADRAO)
};
