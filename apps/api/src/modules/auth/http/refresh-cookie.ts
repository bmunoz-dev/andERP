import type { CookieOptions, Request, Response } from 'express';

/** Cookie del refresh token (F01 CA-1). Solo viaja a las rutas de auth. */
export const REFRESH_COOKIE = 'anderp_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const baseOptions: CookieOptions = {
  httpOnly: true,
  // Los navegadores tratan localhost como contexto seguro, así que también funciona en local.
  secure: true,
  sameSite: 'strict',
  path: REFRESH_COOKIE_PATH,
};

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions, expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions);
}

export function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
