/* Validação do estado do projeto recebido do frontend.
   Estrutura = a de projectState.js (medidas em cm, origem no centro do chão).
   Regras deliberadamente tolerantes com o que o gerador de layout produz,
   mas rejeitam dados que partiriam o projeto (tipos errados, valores absurdos,
   módulos inexistentes no catálogo, IDs repetidos, módulos fora do ambiente). */
const { z, numero } = require('./common');
const { Catalogo } = require('../services/engine');

const chaves = (obj) => Object.keys(obj);
const enumDe = (obj, nome) =>
  z.string().refine((v) => Object.prototype.hasOwnProperty.call(obj, v), { message: `${nome} desconhecido. Valores aceites: ${chaves(obj).join(', ')}.` });

// Limites do ambiente (iguais a set_room_dimensions no frontend)
const LIMITES_ESPACO = { largura: [100, 1200], profundidade: [100, 1000], altura: [200, 400] };
const TOLERANCIA = 2; // cm

const espacoSchema = z.object({
  largura: numero(...LIMITES_ESPACO.largura),
  profundidade: numero(...LIMITES_ESPACO.profundidade),
  altura: numero(...LIMITES_ESPACO.altura)
});

const PAREDES = ['fundo', 'esquerda', 'direita', 'frente'];

const aberturaSchema = z
  .object({
    id: z.string().max(60).optional(),
    parede: z.enum(PAREDES),
    posicao: numero(0, 1200),
    largura: numero(0, 1200),
    altura: numero(0, 400).optional(),
    peitoril: numero(0, 400).optional()
  })
  .passthrough();

const pontoSchema = z
  .object({ parede: z.enum(PAREDES), posicao: numero(-1200, 1200), altura: numero(0, 400) })
  .passthrough();

const valorComponente = z.union([z.number().finite().min(0).max(100), z.boolean(), z.string().max(40), z.null()]);

const moduloSchema = z
  .object({
    id: z.string().min(1).max(60).regex(/^[\w-]+$/, 'ID de módulo inválido.'),
    catalogoId: enumDe(Object.fromEntries(Catalogo.MODULOS.map((m) => [m.id, true])), 'Módulo do catálogo'),
    tipo: z.string().max(40),
    nome: z.string().max(160),
    nomeAuto: z.boolean().optional(),
    zona: z.string().max(20).optional(),
    parede: z.enum(PAREDES).nullable().optional(),
    posicao: z.object({ x: numero(-1200, 1200), y: numero(0, 400), z: numero(-1200, 1200) }),
    rotacao: numero(-360, 360).default(0),
    dimensoes: z.object({ largura: numero(1, 1200), altura: numero(1, 400), profundidade: numero(1, 1000) }),
    material: z.string().max(40).optional(),
    acabamento: z.string().max(40).optional(),
    componentes: z.record(valorComponente).default({})
  })
  .passthrough();

const conversaSchema = z
  .object({
    respondidos: z.record(z.boolean()).optional(),
    perguntaAtual: z.string().max(60).nullable().optional(),
    concluida: z.boolean().optional(),
    historico: z
      .array(z.object({ autor: z.string().max(20), texto: z.string().max(4000), opcoes: z.array(z.string().max(200)).max(20).nullable().optional() }).passthrough())
      .max(200)
      .optional()
  })
  .passthrough();

const projetoSchema = z
  .object({
    tipo: enumDe(Catalogo.AMBIENTES, 'Tipo de ambiente'),
    espaco: espacoSchema,
    paredes: z.array(z.object({}).passthrough()).max(20).optional(),
    portas: z.array(aberturaSchema).max(10).default([]),
    janelas: z.array(aberturaSchema).max(10).default([]),
    pontos: z
      .object({ agua: z.array(pontoSchema).max(20).default([]), gas: z.array(pontoSchema).max(20).default([]), eletrica: z.array(pontoSchema).max(40).default([]) })
      .default({}),
    estilo: enumDe(Catalogo.ESTILOS, 'Estilo').default('moderno'),
    material: enumDe(Catalogo.MATERIAIS, 'Material').default('MDF'),
    acabamento: enumDe(Catalogo.ACABAMENTOS, 'Acabamento').default('Carvalho'),
    preferencias: z.record(z.union([z.string().max(60), z.number().finite(), z.boolean(), z.null()])).default({}),
    eletrodomesticos: z.array(enumDe(Catalogo.ELETRODOMESTICOS, 'Eletrodoméstico')).max(20).default([]),
    modulos: z.array(moduloSchema).max(300).default([]),
    observacoes: z.string().max(5000).default(''),
    estado: z.string().max(40).default('em_configuracao'),
    selecionado: z.string().max(60).nullable().optional(),
    layoutManual: z.boolean().optional(),
    avisos: z.array(z.string().max(500)).max(50).optional(),
    conversa: conversaSchema.optional()
  })
  .passthrough()
  .superRefine((p, ctx) => {
    const vistos = new Set();
    const W = p.espaco.largura / 2 + TOLERANCIA;
    const D = p.espaco.profundidade / 2 + TOLERANCIA;
    p.modulos.forEach((m, i) => {
      if (vistos.has(m.id)) ctx.addIssue({ code: 'custom', path: ['modulos', i, 'id'], message: `ID de módulo repetido: ${m.id}.` });
      vistos.add(m.id);
      if (Math.abs(m.posicao.x) > W || Math.abs(m.posicao.z) > D) {
        ctx.addIssue({ code: 'custom', path: ['modulos', i, 'posicao'], message: `O módulo ${m.id} está fora dos limites do ambiente.` });
      }
      if (m.dimensoes.largura > p.espaco.largura + TOLERANCIA && m.dimensoes.largura > p.espaco.profundidade + TOLERANCIA) {
        ctx.addIssue({ code: 'custom', path: ['modulos', i, 'dimensoes', 'largura'], message: `O módulo ${m.id} é maior do que o ambiente.` });
      }
    });
    if (p.selecionado && !vistos.has(p.selecionado)) p.selecionado = null;
  });

// Campos de metadados (não fazem parte do estado 3D)
const META_CAMPOS = ['id', 'nome', 'clienteId', 'cliente', 'orcamentoEstimado', 'enviadoEm', 'criadoEm', 'atualizadoEm'];

const metaSchema = z.object({
  nome: z.string().trim().min(1, 'O nome não pode ficar vazio.').max(160).optional(),
  clienteId: z.string().uuid('clienteId deve ser um UUID.').nullable().optional()
});

module.exports = { projetoSchema, metaSchema, META_CAMPOS, LIMITES_ESPACO };
