/* ============================================================
   Envio de notificações para a Novari por email.
   O email leva a ficha do marceneiro no corpo: vistas 3D embutidas
   na mensagem, medidas de cada módulo, pontos técnicos e os links
   para a ficha online e o 3D interativo.
   Fornecedores (.env):
     RESEND_API_KEY → API HTTP do Resend (use no Render gratuito, que
                      bloqueia as portas SMTP)
     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS → SMTP/nodemailer
                      (Gmail: smtp.gmail.com, 465, o endereço e uma
                      "senha de app")
   Sem nenhum, o projeto fica só registado no banco e o planejador usa
   o envio alternativo (formulário com a imagem em anexo).
   ============================================================ */
const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');
const { renderizarFicha } = require('./fichaService');

let transporte = null;

const fornecedor = () => (config.email.resendApiKey ? 'resend' : config.email.smtpHost ? 'smtp' : null);
const estaConfigurado = () => fornecedor() !== null;

function obterTransporte() {
  if (!transporte) {
    const e = config.email;
    transporte = nodemailer.createTransport({
      host: e.smtpHost,
      port: e.smtpPort,
      secure: e.smtpPort === 465,
      auth: e.smtpUser ? { user: e.smtpUser, pass: e.smtpPass } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000
    });
  }
  return transporte;
}

async function enviarPorResend({ para, assunto, texto, html, anexos, responderPara }) {
  const r = await fetch(config.email.resendUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.email.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.email.from,
      to: [para],
      reply_to: responderPara || undefined,
      subject: assunto,
      text: texto,
      html,
      attachments: (anexos || []).map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
        content_type: a.contentType,
        content_id: a.cid
      }))
    }),
    signal: AbortSignal.timeout(30_000)
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend respondeu ${r.status}: ${corpo.message || corpo.name || 'erro desconhecido'}`);
  return { enviado: true, id: corpo.id };
}

async function enviarEmail(mensagem) {
  const via = fornecedor();
  if (!via) return { enviado: false, motivo: 'EMAIL_NAO_CONFIGURADO' };
  if (via === 'resend') return enviarPorResend(mensagem);
  const { para, assunto, texto, html, anexos, responderPara } = mensagem;
  const info = await obterTransporte().sendMail({
    from: config.email.from,
    to: para,
    replyTo: responderPara || undefined,
    subject: assunto,
    text: texto,
    html,
    attachments: anexos
  });
  return { enviado: true, id: info.messageId };
}

/**
 * envio: registo do envio; cliente: { nome, email, telefone };
 * vistas: [{ nome, titulo, mime, dados: Buffer }] pela ordem do envio.
 */
async function notificarNovoProjeto({ envio, cliente, vistas = [] }) {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const cid = (i) => `vista-${i}@novari`;
  const html = renderizarFicha(
    { envio, cliente, vistas: vistas.map((v, ordem) => ({ ...v, ordem })) },
    { srcVista: (v) => `cid:${cid(v.ordem)}`, email: true }
  );
  const nomeCliente = (cliente && cliente.nome) || 'Cliente';
  const r = await enviarEmail({
    para: config.novariEmail,
    assunto: `Novo projeto personalizado — ${nomeCliente}`,
    texto: envio.resumo,
    html,
    responderPara: cliente && cliente.email,
    anexos: vistas.map((v, i) => ({
      filename: `${v.nome}.${ext[v.mime] || 'jpg'}`,
      content: v.dados,
      contentType: v.mime,
      cid: cid(i)
    }))
  });
  if (r.enviado) logger.info('Projeto enviado por email à Novari', { envioId: envio.id, vistas: vistas.length });
  else logger.info('Projeto registado; envio automático de email não configurado', { envioId: envio.id });
  return r;
}

module.exports = { notificarNovoProjeto, estaConfigurado };
