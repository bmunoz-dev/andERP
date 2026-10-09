/**
 * F07 CA-10: Worker que reenvía `/api/*` a la API en Render. El resto de rutas lo sirve Cloudflare
 * con los archivos estáticos de `dist` sin pasar por aquí (`run_worker_first` en wrangler.jsonc). Así el navegador habla con un
 * solo origen (la cookie `SameSite=Strict` funciona y no hace falta CORS) y la API solo acepta
 * peticiones que traen `X-Proxy-Secret`. La IP real del navegador va en `X-Client-IP`.
 */
interface Env {
  /** Origen de la API, sin barra final: `https://anderp-api.onrender.com`. */
  API_ORIGIN: string;
  PROXY_SECRET: string;
}

// Solo estas cabeceras del navegador llegan a la API; el resto (Host, X-Proxy-Secret…) se descarta.
const FORWARDED = ['authorization', 'cookie', 'content-type', 'accept', 'user-agent'];

export async function proxy(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('X-Proxy-Secret', env.PROXY_SECRET);
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) headers.set('X-Client-IP', clientIp);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const response = await fetch(`${env.API_ORIGIN}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : null,
    redirect: 'manual',
  });
  // Mismo estado, cuerpo y cabeceras, incluido Set-Cookie.
  return new Response(response.body, response);
}

export default { fetch: proxy };
