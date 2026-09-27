/* Estrutura inicial: clientes, projetos e envios de projetos para a Novari.
   O estado completo do projeto 3D fica em "dados" (JSON); as colunas ao lado
   (tipo, estado, orçamento…) servem para listar e filtrar sem abrir o JSON. */

exports.up = async function up(knex) {
  await knex.schema.createTable('clients', (t) => {
    t.string('id', 36).primary();
    t.string('nome', 160).notNullable();
    t.string('email', 254).unique();
    t.string('telefone', 40);
    t.text('observacoes');
    t.timestamp('created_at', { useTz: true }).notNullable();
    t.timestamp('updated_at', { useTz: true }).notNullable();
  });

  await knex.schema.createTable('projects', (t) => {
    t.string('id', 36).primary();
    t.string('client_id', 36).references('id').inTable('clients').onDelete('SET NULL');
    t.string('nome', 160).notNullable();
    t.string('tipo', 40).notNullable();
    t.string('estado', 40).notNullable();
    t.decimal('orcamento_estimado', 12, 2).notNullable().defaultTo(0);
    t.jsonb('dados').notNullable();
    t.timestamp('enviado_em', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable();
    t.timestamp('updated_at', { useTz: true }).notNullable();
    t.index(['client_id']);
    t.index(['updated_at']);
  });

  await knex.schema.createTable('project_submissions', (t) => {
    t.string('id', 36).primary();
    t.string('project_id', 36).notNullable().references('id').inTable('projects').onDelete('CASCADE');
    t.string('client_id', 36).references('id').inTable('clients').onDelete('SET NULL');
    t.string('destino', 254).notNullable();
    t.string('status', 40).notNullable();
    t.text('resumo').notNullable();
    t.jsonb('especificacoes').notNullable();
    t.decimal('orcamento_estimado', 12, 2).notNullable().defaultTo(0);
    t.timestamp('created_at', { useTz: true }).notNullable();
    t.index(['project_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('project_submissions');
  await knex.schema.dropTableIfExists('projects');
  await knex.schema.dropTableIfExists('clients');
};
