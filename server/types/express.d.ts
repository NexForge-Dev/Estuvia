// Campos que os middlewares da Estuvia acrescentam ao Request do Express (só para a checagem de tipos).
declare global {
  namespace Express {
    interface Request {
      /** Usuário autenticado, gravado por requireAuth/optionalAuth (server/auth.js). */
      user?: any;
    }
  }
}
export {};
