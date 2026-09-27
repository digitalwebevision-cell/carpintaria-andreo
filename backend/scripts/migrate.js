/* npm run db:migrate — cria/atualiza as tabelas sem iniciar o servidor. */
const { migrar, fechar } = require('../database');

migrar()
  .then((aplicadas) => {
    console.log(aplicadas.length ? `Migrações aplicadas: ${aplicadas.join(', ')}` : 'Banco de dados já está atualizado.');
  })
  .catch((e) => {
    console.error('Falha ao migrar o banco de dados:', e.message);
    process.exitCode = 1;
  })
  .finally(fechar);
