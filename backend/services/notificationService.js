/* ============================================================
   Envio de notificações para a Novari.
   Estrutura preparada: hoje o envio automático de email não está
   configurado, por isso o projeto fica registado no banco
   (project_submissions) e o frontend continua a abrir o email do
   cliente (mailto) como até agora.
   Para ativar o envio real, implemente enviarEmail() com um
   fornecedor (SMTP/nodemailer, Resend, SES…) e as credenciais no .env.
   ============================================================ */
const config = require('../config');
const logger = require('../utils/logger');

async function enviarEmail(/* { para, assunto, texto } */) {
  return { enviado: false, motivo: 'EMAIL_NAO_CONFIGURADO' };
}

async function notificarNovoProjeto({ envio, resumo }) {
  const r = await enviarEmail({
    para: config.novariEmail,
    assunto: 'Novo projeto personalizado — Novari',
    texto: resumo
  });
  if (r.enviado) logger.info('Projeto enviado por email à Novari', { envioId: envio.id });
  else logger.info('Projeto registado; envio automático de email não configurado', { envioId: envio.id });
  return r;
}

module.exports = { notificarNovoProjeto };
