/* Regista cada pedido à API: método, caminho (sem query string), status e duração. */
const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const linha = `${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${ms.toFixed(1)}ms`;
    if (res.statusCode >= 500) logger.error(linha);
    else if (res.statusCode >= 400) logger.warn(linha);
    else logger.info(linha);
  });
  next();
}

module.exports = requestLogger;
