/* Erro de aplicação com código estável e status HTTP. O middleware de erros
   converte-o na resposta { success: false, error: { code, message, details? } }. */
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  static notFound(code, message) {
    return new AppError(404, code, message);
  }

  static validation(details, message = 'Dados inválidos.') {
    return new AppError(422, 'VALIDATION_ERROR', message, details);
  }
}

module.exports = AppError;
