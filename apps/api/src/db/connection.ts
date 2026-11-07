/** Hosts de Docker local y Testcontainers: sin TLS. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLocalDatabase(url: string): boolean {
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

/** F22 CA-1: TLS obligatorio con todo host que no sea local (Supabase, el runner, Render). */
export function sslFor(url: string): 'require' | false {
  return isLocalDatabase(url) ? false : 'require';
}
