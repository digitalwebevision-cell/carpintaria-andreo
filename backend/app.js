/* Aplicação Express (sem abrir porta — usada pelo server.js e pelos testes). */
const express = require('express');
const config = require('./config');
const rotas = require('./routes');
const requestLogger = require('./middleware/requestLogger');
const { corsApi, protegerEstaticos } = require('./middleware/security');
const { rotaNaoEncontrada, tratarErros } = require('./middleware/errorHandler');

function criarApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use('/api', requestLogger, corsApi);
  // O envio leva as vistas 3D (imagens) do projeto: limite maior só nesta rota
  app.post('/api/projects/:id/send', express.json({ limit: '14mb' }));
  app.use('/api', express.json({ limit: '2mb' }));
  app.use('/api', rotas);
  app.use('/api', rotaNaoEncontrada);

  // Opcional: servir o site (index.html, configurador.html…) na mesma origem
  if (config.serveFrontend) {
    app.use(protegerEstaticos, express.static(config.frontendDir, { dotfiles: 'ignore', index: 'index.html' }));
  }

  app.use(tratarErros);
  return app;
}

module.exports = { criarApp };
