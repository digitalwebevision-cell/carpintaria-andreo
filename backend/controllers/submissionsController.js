/* Envios: ficha técnica do marceneiro e vistas 3D. */
const fichaService = require('../services/fichaService');

// A ficha só carrega as próprias imagens e estilos inline
const CSP_FICHA = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

module.exports = {
  async ficha(req, res) {
    const html = await fichaService.gerarFicha(req.params.id);
    res.set({ 'Content-Security-Policy': CSP_FICHA, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' });
    res.type('html').send(html);
  },
  async vista(req, res) {
    const v = await fichaService.obterVista(req.params.id, req.params.ordem);
    res.set({ 'Cache-Control': 'private, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' });
    res.type(v.mime).send(v.dados);
  }
};
