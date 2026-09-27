/* Configuração do Knex a partir de DATABASE_URL.
   O código de acesso a dados usa apenas o query builder do Knex, por isso trocar
   SQLite por PostgreSQL é só mudar DATABASE_URL (e instalar o driver "pg"). */
const path = require('node:path');
const config = require('./index');

const MIGRATIONS = {
  directory: path.join(config.backendDir, 'database', 'migrations'),
  tableName: 'knex_migrations'
};

function configSqlite(ficheiro) {
  const filename = ficheiro === ':memory:' ? ':memory:' : path.resolve(config.backendDir, ficheiro);
  return {
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
    migrations: MIGRATIONS,
    pool: {
      // SQLite só aplica chaves estrangeiras com este pragma ativo
      afterCreate(conn, done) {
        conn.pragma('foreign_keys = ON');
        conn.pragma('journal_mode = WAL');
        done(null, conn);
      },
      ...(filename === ':memory:' ? { min: 1, max: 1, idleTimeoutMillis: Number.MAX_SAFE_INTEGER } : {})
    }
  };
}

function knexConfig(url = config.databaseUrl) {
  const u = String(url || '').trim();
  if (!u) return configSqlite(path.join('database', 'novari.sqlite'));
  if (/^(sqlite3?|file):/i.test(u)) return configSqlite(u.replace(/^(sqlite3?|file):(\/\/)?/i, '') || ':memory:');
  if (/^postgres(ql)?:\/\//i.test(u)) {
    return {
      client: 'pg',
      connection: u,
      pool: { min: 0, max: 10 },
      migrations: MIGRATIONS
    };
  }
  throw new Error('DATABASE_URL não reconhecido. Use sqlite:<ficheiro> ou postgres://…');
}

module.exports = { knexConfig };
