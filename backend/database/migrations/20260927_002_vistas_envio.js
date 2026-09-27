/* Planificação 3D enviada ao marceneiro: imagens das vistas do projeto
   (perspetiva, planta, frontal, lateral) capturadas no momento do envio. */

exports.up = async function up(knex) {
  await knex.schema.createTable('submission_views', (t) => {
    t.string('id', 36).primary();
    t.string('submission_id', 36).notNullable().references('id').inTable('project_submissions').onDelete('CASCADE');
    t.integer('ordem').notNullable();
    t.string('nome', 40).notNullable();
    t.string('titulo', 80).notNullable();
    t.string('mime', 40).notNullable();
    t.binary('dados').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable();
    t.unique(['submission_id', 'ordem']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('submission_views');
};
