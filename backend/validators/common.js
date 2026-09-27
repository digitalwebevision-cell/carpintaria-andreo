const { z } = require('zod');
const AppError = require('../utils/AppError');

// Converte os erros do zod em [{ campo, mensagem }]
function detalhesZod(erro) {
  return erro.issues.slice(0, 30).map((i) => ({
    campo: i.path.join('.') || '(raiz)',
    mensagem: i.message
  }));
}

function validar(schema, dados, mensagem) {
  const r = schema.safeParse(dados);
  if (!r.success) throw AppError.validation(detalhesZod(r.error), mensagem);
  return r.data;
}

const numero = (min, max) => z.number({ invalid_type_error: 'Deve ser um número.' }).finite().min(min).max(max);

module.exports = { z, validar, detalhesZod, numero };
