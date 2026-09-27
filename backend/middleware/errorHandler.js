/* Tratamento centralizado de erros.
   Todas as falhas saem como { success: false, error: { code, message, details? } }.
   Stack traces e mensagens internas nunca são enviadas ao cliente. */
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function rotaNaoEncontrada(req, res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Rota não encontrada: ${req.method} ${req.path}`));
}

function eRestricaoUnica(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === '23505');
}

// eslint-disable-next-line no-unused-vars
function tratarErros(err, req, res, next) {
  let erro = err;

  if (err && err.type === 'entity.parse.failed') {
    erro = new AppError(400, 'INVALID_JSON', 'O corpo do pedido não é um JSON válido.');
  } else if (err && err.type === 'entity.too.large') {
    erro = new AppError(413, 'PAYLOAD_TOO_LARGE', 'O pedido é demasiado grande.');
  } else if (eRestricaoUnica(err)) {
    erro = new AppError(409, 'CONFLICT', 'Já existe um registo com estes dados.');
  } else if (!(err instanceof AppError)) {
    logger.error(`Erro inesperado em ${req.method} ${req.path}`, err);
    erro = new AppError(500, 'INTERNAL_ERROR', 'Ocorreu um erro interno. Tente novamente mais tarde.');
  } else if (erro.status >= 500) {
    logger.error(`${erro.code} em ${req.method} ${req.path}: ${erro.message}`);
  }

  if (res.headersSent) return;
  res.status(erro.status).json({
    success: false,
    error: {
      code: erro.code,
      message: erro.message,
      ...(erro.details ? { details: erro.details } : {})
    }
  });
}

module.exports = { rotaNaoEncontrada, tratarErros };
