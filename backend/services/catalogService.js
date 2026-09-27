/* ============================================================
   Catálogo de módulos.
   Ponto único de acesso ao catálogo para todo o backend.
   Hoje a fonte é furnitureCatalog.js (o mesmo ficheiro do site).
   Para a Novari editar preços/módulos sem mexer no frontend, basta
   trocar a implementação destas funções por uma leitura do banco
   (ex.: tabela catalog_modules) — rotas e serviços não mudam.
   ============================================================ */
const { Catalogo } = require('./engine');
const { clone } = require('../utils/helpers');

function obterCatalogo(ambiente) {
  const modulos = ambiente ? Catalogo.listarPorAmbiente(ambiente) : Catalogo.MODULOS;
  return clone({
    fonte: 'furnitureCatalog.js',
    ambientes: Catalogo.AMBIENTES,
    materiais: Catalogo.MATERIAIS,
    acabamentos: Object.fromEntries(Object.entries(Catalogo.ACABAMENTOS).map(([k, a]) => [k, { nome: a.nome, fator: a.fator }])),
    estilos: Catalogo.ESTILOS,
    eletrodomesticos: Catalogo.ELETRODOMESTICOS,
    precos: Catalogo.PRECOS,
    modulos,
    presets: Catalogo.PRESETS
  });
}

function obterModulo(id) {
  return clone(Catalogo.getModulo(id));
}

module.exports = { obterCatalogo, obterModulo };
