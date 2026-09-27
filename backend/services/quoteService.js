/* ============================================================
   Orçamento estimado.
   Usa a mesma fórmula do planejador (projectState.calcularOrcamento +
   furnitureCatalog.precoModulo), por isso o valor do servidor bate
   certo com o que o cliente vê no ecrã.
   O resultado é SEMPRE um valor aproximado — nunca o orçamento final.
   ============================================================ */
const engine = require('./engine');
const { z, validar } = require('../validators/common');
const { arredondar } = require('../utils/helpers');

const C = engine.Catalogo;

const AVISO = 'Valor aproximado — não é o orçamento final da Novari.';

const moduloEntrada = z
  .object({
    catalogoId: z.string().refine((id) => !!C.getModulo(id), { message: 'Módulo do catálogo desconhecido.' }),
    quantidade: z.number().int().min(1).max(50).default(1),
    dimensoes: z
      .object({ largura: z.number().finite().min(1).max(1200), altura: z.number().finite().min(1).max(400), profundidade: z.number().finite().min(1).max(1000) })
      .partial()
      .optional(),
    componentes: z.record(z.union([z.number().finite().min(0).max(100), z.boolean(), z.string().max(40)])).optional()
  })
  .passthrough();

const pedidoEstimativa = z.object({
  modulos: z.array(moduloEntrada).max(300),
  material: z.string().refine((v) => !!C.MATERIAIS[v], { message: 'Material desconhecido.' }).default('MDF'),
  acabamento: z.string().refine((v) => !!C.ACABAMENTOS[v], { message: 'Acabamento desconhecido.' }).default('Carvalho'),
  preferencias: z.object({ bancada: z.boolean().optional() }).passthrough().default({}),
  eletrodomesticos: z.array(z.string()).max(20).optional()
});

function formatar(resultado) {
  const total = arredondar(resultado.total);
  return {
    valorAproximado: total,
    valorFormatado: C.formatarMoeda(total),
    moeda: 'BRL',
    linhas: resultado.linhas.map((l) => ({ rotulo: l.rotulo, valor: arredondar(l.valor) })),
    aviso: AVISO,
    calculadoEm: new Date().toISOString()
  };
}

/** Estimativa de um projeto completo (estado do planejador). */
function estimarProjeto(projeto) {
  return formatar(engine.calcularOrcamento(projeto));
}

/**
 * Estimativa a partir de uma lista de módulos (catalogoId + medidas/componentes
 * opcionais), material e acabamento. Útil para simulações rápidas.
 */
function estimarModulos(entrada) {
  const pedido = validar(pedidoEstimativa, entrada, 'Pedido de orçamento inválido.');
  const modulos = [];
  pedido.modulos.forEach((m) => {
    for (let i = 0; i < m.quantidade; i += 1) {
      const criado = C.criarModulo(m.catalogoId, { dimensoes: m.dimensoes || {}, componentes: m.componentes || {} });
      modulos.push(JSON.parse(JSON.stringify(criado)));
    }
  });
  const projeto = {
    modulos,
    material: pedido.material,
    acabamento: pedido.acabamento,
    preferencias: { bancada: true, ...pedido.preferencias }
  };
  return { ...estimarProjeto(projeto), modulos: modulos.length };
}

module.exports = { estimarProjeto, estimarModulos, AVISO };
