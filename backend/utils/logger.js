/* Logger simples, sem dependências. Nunca regista chaves, senhas ou contactos. */
const config = require('../config');

const NIVEIS = { silent: -1, error: 0, warn: 1, info: 2, debug: 3 };
const SENSIVEL = /(key|token|secret|password|senha|authorization|cookie|email|telefone|phone)/i;

function limpar(valor, profundidade = 0) {
  if (valor instanceof Error) return { erro: valor.message, ...(config.isProduction ? {} : { stack: valor.stack }) };
  if (!valor || typeof valor !== 'object' || profundidade > 3) return valor;
  if (Array.isArray(valor)) return valor.slice(0, 20).map((v) => limpar(v, profundidade + 1));
  const out = {};
  Object.entries(valor).forEach(([k, v]) => {
    out[k] = SENSIVEL.test(k) ? '[omitido]' : limpar(v, profundidade + 1);
  });
  return out;
}

function registar(nivel, mensagem, meta) {
  const atual = NIVEIS[config.logLevel] ?? NIVEIS.info;
  if (NIVEIS[nivel] > atual) return;
  let linha = `[${new Date().toISOString()}] ${nivel.toUpperCase().padEnd(5)} ${mensagem}`;
  if (meta !== undefined) linha += ' ' + JSON.stringify(limpar(meta));
  (nivel === 'error' ? console.error : console.log)(linha);
}

module.exports = {
  error: (msg, meta) => registar('error', msg, meta),
  warn: (msg, meta) => registar('warn', msg, meta),
  info: (msg, meta) => registar('info', msg, meta),
  debug: (msg, meta) => registar('debug', msg, meta)
};
