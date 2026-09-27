const { z } = require('./common');

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email('Email inválido.');

const telefone = z
  .string()
  .trim()
  .max(40)
  .regex(/^[\d\s()+.-]*$/, 'Telefone inválido.');

const clienteSchema = z
  .object({
    nome: z.string().trim().min(1, 'O nome é obrigatório.').max(160),
    email: email.nullable().optional(),
    telefone: telefone.nullable().optional(),
    observacoes: z.string().max(5000).nullable().optional()
  })
  .strict();

const clienteParcialSchema = clienteSchema.partial();

module.exports = { clienteSchema, clienteParcialSchema };
