/**
 * Solo acepta rutas internas ("/algo"). Evita que un enlace malicioso como
 * `/login?redirect=https://sitio-falso.com` saque al usuario de AndERP después de iniciar sesión.
 */
export function safeRedirect(target: string | undefined, fallback = '/'): string {
  if (!target?.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
    return fallback;
  }
  return target;
}
