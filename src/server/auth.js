import { createAithneClient } from 'lucos_aithne_jsclient';

const AITHNE_ORIGIN = process.env.AITHNE_ORIGIN ?? 'https://aithne.l42.eu';
export { AITHNE_ORIGIN };

// seinn is a UI wrapper over lucos_media_manager and shares its scope string:
// media-manager:use. Do not invent a seinn-specific scope.
const REQUIRED_SCOPE = 'media-manager:use';

// Verification, JWKS serve-stale, and scope-gating are all owned by
// lucos_aithne_jsclient (ADR-0001) — this module owns only presentation.
// jwksUrl overrides only the JWKS fetch address (e.g. Docker bridge IP in
// dev); the library derives the issuer check and loginUrl() from origin
// regardless, so that invariant can't drift here.
const aithne = createAithneClient({
	origin: AITHNE_ORIGIN,
	jwksUrl: process.env.AITHNE_JWKS_URL,
	environment: process.env.ENVIRONMENT,
});

/**
 * Override the JWT verifier. For testing only — do not call in production code.
 * Allows unit tests to exercise the middleware without a live JWKS endpoint.
 */
export function _setVerifier(fn) {
	aithne._setVerifier(fn);
}

/**
 * Verify the aithne_session JWT from a cookie header string.
 * Returns an object with:
 *   - authenticated: true if the JWT signature/claims are valid
 *   - authorized: true if authenticated AND the principal has media-manager:use scope
 *   - payload: the JWT payload (null unless authenticated)
 *
 * A JWKS infrastructure failure (aithne unreachable, serve-stale couldn't
 * rescue) is reported the same as "not authenticated" — there's no local
 * "sign-in unavailable" page (that pattern was abandoned, lucas42/lucos#260).
 */
export async function verifySessionToken(cookieHeader) {
	const classification = await aithne.verifySession(cookieHeader, { requiredScope: REQUIRED_SCOPE });
	if (classification.outcome === 'unauthenticated' && classification.error) {
		console.warn('JWT verification failed:', classification.error.message);
	}
	return {
		authenticated: classification.outcome === 'authorized' || classification.outcome === 'forbidden',
		authorized: classification.outcome === 'authorized',
		payload: classification.payload,
	};
}

/**
 * Express middleware for checking authentication.
 * Three-branch pattern per consumer-migration-guide C2:
 *   1. Valid token + media-manager:use scope → proceed.
 *   2. Valid token, missing scope → render seinn's own styled 403 (no redirect —
 *      re-login yields the same scopeless token, causing an infinite loop).
 *   3. No/expired/invalid token, or aithne unreachable → 302 redirect to
 *      aithne login. `next` is populated from the server-side request URL
 *      only (open-redirect guard) and validated by aithne.loginUrl().
 */
export async function middleware(req, res, next) {
	const result = await verifySessionToken(req.headers.cookie);

	if (result.authenticated && result.authorized) {
		res.auth_agent = result.payload;
		return next();
	}

	if (result.authenticated && !result.authorized) {
		// Valid session but missing media-manager:use scope — render a 403, do not redirect.
		// Redirecting to login is pointless: they already have a valid session; a fresh
		// login yields the same scopeless token and creates an infinite loop.
		console.warn('JWT missing required %s scope:', REQUIRED_SCOPE, result.payload?.sub);
		res.status(403);
		return res.render('error', {
			message: "This action requires the `media-manager:use` scope. Contact the administrator to request access.",
		});
	}

	// Not authenticated — redirect to aithne login.
	// Use APP_ORIGIN as the base URL for the `next` param — it is set by lucos_creds and
	// is not user-controllable, unlike the raw Host header. Falls back to constructing
	// the origin from protocol + host (which is correct in development / tests).
	// req.protocol is populated from X-Forwarded-Proto by Express when trust proxy
	// is set (configured in index.js), so this correctly returns 'https' in production.
	const appOrigin = process.env.APP_ORIGIN ?? `${req.protocol}://${req.headers.host}`;
	const returnUrl = `${appOrigin}${req.originalUrl}`;
	return res.redirect(302, aithne.loginUrl(returnUrl));
}

/**
 * CSRF middleware for state-mutating requests (PUT, POST, DELETE, PATCH).
 *
 * The aithne_session cookie uses SameSite=None, so browsers send it on all
 * cross-origin requests including CSRF-triggered ones. This middleware rejects
 * state-mutating requests whose Origin (or Referer, as a fallback) does not
 * originate from an allowed domain (*.l42.eu, or localhost in development).
 *
 * Requests with no Origin and no Referer header are allowed — these are
 * same-origin requests that do not carry the CSRF risk.
 */
export function csrfMiddleware(req, res, next) {
	const method = req.method.toUpperCase();
	if (!['PUT', 'POST', 'DELETE', 'PATCH'].includes(method)) return next();

	const env = process.env.ENVIRONMENT ?? 'production';

	function isAllowedOrigin(str) {
		if (!str) return false;
		try {
			const url = new URL(str);
			if (env === 'development' && url.hostname === 'localhost') return true;
			return url.hostname === 'l42.eu' || url.hostname.endsWith('.l42.eu');
		} catch {
			return false;
		}
	}

	const origin = req.headers['origin'];
	const referer = req.headers['referer'];

	if (origin !== undefined) {
		if (!isAllowedOrigin(origin)) {
			return res.status(403).json({ errorMessage: 'CSRF check failed: disallowed Origin' });
		}
	} else if (referer) {
		if (!isAllowedOrigin(referer)) {
			return res.status(403).json({ errorMessage: 'CSRF check failed: disallowed Referer' });
		}
	}
	// Neither Origin nor Referer present → allow (same-origin form/fetch, no CSRF risk).
	next();
}
