/* Ligação única ao banco de dados (Knex). */
const knex = require('knex');
const { knexConfig } = require('../config/database');
const logger = require('../utils/logger');

let db = null;

function getDb() {
  if (!db) {
    const cfg = knexConfig();
    db = knex(cfg);
    logger.debug('Banco de dados configurado', { client: cfg.client });
  }
  return db;
}

async function migrar() {
  const [lote, aplicadas] = await getDb().migrate.latest();
  if (aplicadas.length) logger.info(`Migrações aplicadas (lote ${lote})`, { migracoes: aplicadas });
  return aplicadas;
}

async function fechar() {
  if (db) {
    await db.destroy();
    db = null;
  }
}

module.exports = { getDb, migrar, fechar };
