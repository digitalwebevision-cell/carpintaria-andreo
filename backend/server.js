/* Ponto de entrada: prepara o banco de dados e inicia o servidor HTTP. */
const config = require('./config');
const logger = require('./utils/logger');
const { migrar, fechar } = require('./database');
const { criarApp } = require('./app');
const aiService = require('./services/aiService');

async function iniciar() {
  await migrar();
  const app = criarApp();
  const servidor = app.listen(config.port, () => {
    logger.info(`Novari API a funcionar em http://localhost:${config.port} (${config.env})`);
    if (config.serveFrontend) logger.info(`Planejador disponível em http://localhost:${config.port}/configurador.html`);
    logger.info(aiService.estaConfigurada() ? `IA ativa (modelo ${config.ai.model})` : 'IA não configurada (AI_API_KEY vazio): o planejador usa o interpretador local');
  });

  const encerrar = (sinal) => {
    logger.info(`${sinal} recebido, a encerrar…`);
    servidor.close(async () => {
      await fechar();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
}

iniciar().catch((e) => {
  logger.error('Não foi possível iniciar o servidor', e);
  process.exit(1);
});
