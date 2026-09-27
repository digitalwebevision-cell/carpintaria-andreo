const { randomUUID } = require('node:crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const novoId = () => randomUUID();
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const agora = () => new Date().toISOString();
const clone = (obj) => (obj === undefined ? undefined : JSON.parse(JSON.stringify(obj)));

// Converte valores de data vindos do banco (string no SQLite, Date no PostgreSQL)
function dataIso(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

// JSON guardado em coluna jsonb (PostgreSQL devolve objeto, SQLite devolve texto)
function lerJson(v, padrao = null) {
  if (v === null || v === undefined) return padrao;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return padrao;
  }
}

// JSON Merge Patch (RFC 7386): objetos fundem-se, arrays substituem-se, null apaga
function mergePatch(alvo, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return clone(patch);
  const out = alvo && typeof alvo === 'object' && !Array.isArray(alvo) ? { ...alvo } : {};
  Object.entries(patch).forEach(([k, v]) => {
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  });
  return out;
}

const arredondar = (v, casas = 2) => Math.round((Number(v) || 0) * 10 ** casas) / 10 ** casas;

module.exports = { novoId, isUuid, agora, clone, dataIso, lerJson, mergePatch, arredondar };
