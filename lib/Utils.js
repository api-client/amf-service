/** @typedef {import('express').Request} Request */

/**
 * Tests whether a request came from a localhost (development)
 *
 * @param {Request} req Request host value
 * @return {boolean} True when this request should be redirected to HTTPS proto
 */
 export function requiresHttpsRedirect(req) {
  const proto = req.headers['x-forwarded-proto'];
  if (!proto) {
    return false;
  }
  if (proto === 'https') {
    return false;
  }
  const { host } = req.headers;
  if (!host) {
    return false;
  }
  const info = String(host);
  return info.startsWith('localhost') || info.startsWith('127.');
}
