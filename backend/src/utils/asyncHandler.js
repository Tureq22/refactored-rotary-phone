// Express 4 NÃO envia erros de funções async para o error handler.
// Sem este wrapper, um erro de banco em qualquer rota async deixa a
// requisição pendurada e derruba o processo com unhandledRejection.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
