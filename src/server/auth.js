import { jwtVerify, createRemoteJWKSet, createLocalJWKSet } from 'jose';

const AITHNE_ORIGIN = process.env.AITHNE_ORIGIN ?? 'https://aithne.l42.eu';
// AITHNE_JWKS_URL overrides only the JWKS fetch address — it MUST NOT influence
// the iss check or ?next= redirect (both continue to derive from AITHNE_ORIGIN).
// Set in dev when running via docker-compose so the JWKS fetch can reach aithne
// on the host machine via host.docker.internal; leave unset in production.
const AITHNE_JWKS_URL = new URL(
    process.env.AITHNE_JWKS_URL ?? `${AITHNE_ORIGIN}/.well-known/jwks.json`
);
const AITHNE_ISSUER = AITHNE_ORIGIN;
const AITHNE_AUDIENCE = 'l42.eu';
const AITHNE_LOGIN_URL = `${AITHNE_ORIGIN}/auth/login`;

export { AITHNE_ORIGIN };

/**
 * True if a jose error indicates a JWKS infrastructure failure (aithne
 * unreachable, timed out, or a key mismatch) rather than a JWT validation
 * failure (bad signature, expired token, wrong audience).
 *
 * jose propagates raw Node network errors (ECONNREFUSED, ENOTFOUND) unwrapped
 * with no ERR_JWKS_* code — these must be caught explicitly as infra failures
 * too.
 */
export function isJWKSInfraError(error) {
	return error.code?.startsWith('ERR_JWKS_') || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND';
}

/**
 * Wrap a jose remote JWKS getter (as returned by createRemoteJWKSet) with
 * serve-stale behaviour, per aithne'"'"'s docs/local-verification-contract.md §1.
 *
 * createRemoteJWKSet does NOT serve stale keys by default: a failed re-fetch
 * (5-minute cache expiry, or an unrecognised kid triggering a re-fetch)
 * throws straight through, even though the previously-fetched key set is
 * still valid. That turns a brief aithne outage into a 401 storm for every
 * user. This wrapper snapshots the key set after every successful fetch and,
 * on a JWKS infrastructure failure, falls back to verifying against that
 * last-known-good snapshot instead of rejecting outright. A kid that is
 * genuinely unknown (not present even in the last-known-good set) still
 * fails verification and is rejected.
 *
 * Exported (rather than only used internally) so it can be unit tested
 * against a fake remote getter, without needing a live JWKS endpoint.
 */
export function createServeStaleJWKS(remoteJWKS) {
	let lastKnownGoodJWKS = null;

	return async function serveStaleJWKS(protectedHeader, token) {
		try {
			const key = await remoteJWKS(protectedHeader, token);
			lastKnownGoodJWKS = remoteJWKS.jwks() ?? lastKnownGoodJWKS;
			return key;
		} catch (error) {
			if (isJWKSInfraError(error) && lastKnownGoodJWKS) {
				console.warn('JWKS fetch failed, serving last-known-good key set:', error.message);
				const staleJWKS = createLocalJWKSet(lastKnownGoodJWKS);
				return staleJWKS(protectedHeader, token);
			}
			throw error;
		}
	};
}

// JWKS key set with automatic caching, kid-based rotation support, and
// serve-stale fallback on fetch failure (see createServeStaleJWKS above).
// jose'"'"'s createRemoteJWKSet fetches on first use, caches for 5 minutes,
// and re-fetches when a token'"'"'s kid is not found in the cache.
const JWKS = createServeStaleJWKS(createRemoteJWKSet(AITHNE_JWKS_URL));

// Internal verify function — replaced in tests via _setVerifier.
let _verifyFn = (token, jwks, opts) => jwtVerify(token, jwks, opts);

/**
 * Override the JWT verifier. For testing only — do not call in production code.
 * Allows unit tests to exercise the middleware without a live JWKS endpoint.
 */
export function _setVerifier(fn) {
	_verifyFn = fn;
}

/**
 * Parse a Cookie header string into a key-value object.
 * Splits on '; ' between pairs and on the first '=' only within each pair,
 * so cookie values that contain '=' (e.g. base64-encoded tokens) are preserved.
 */
export function parseCookies(header) {
	if (!header) return {};
	return Object.fromEntries(
		header.split('; ')
			.filter(part => part.includes('='))
			.map(part => {
				const idx = part.indexOf('=');
				return [part.slice(0, idx), part.slice(idx + 1)];
			})
	);
}

/**
 * Return true if the JWT scopes array grants access to the media player.
 *
 * ADR-0001 §6: access is granted by named scope, not bare identity.
 * seinn is a UI wrapper over lucos_media_manager and shares its scope string:
 * media-manager:use. Do not invent a seinn-specific scope.
 * Accepts render-ui in the development environment as a lucos-ux escape hatch.
 *
 * process.env.ENVIRONMENT is read on every call (not cached at module load) so
 * that tests can control the environment by setting the env var directly.
 */
export function hasMediaManagerAccess(scopes) {
	if (scopes.includes('media-manager:use')) return true;
	if ((process.env.ENVIRONMENT ?? 'production') === 'development' && scopes.includes('render-ui')) return true;
	return false;
}

/**
 * Verify the aithne_session JWT from a cookie header string.
 * Returns an object with:
 *   - authenticated: true if the JWT signature/claims are valid
 *   - authorized: true if authenticated AND the principal has media-manager:use scope
 *   - payload: the JWT payload (only present when authenticated is true)
 */
export async function verifySessionToken(cookieHeader) {
	const cookies = parseCookies(cookieHeader);
	const sessionToken = cookies.aithne_session;

	if (!sessionToken) return { authenticated: false, authorized: false };

	try {
		const { payload } = await _verifyFn(sessionToken, JWKS, {
			issuer: AITHNE_ISSUER,
			audience: AITHNE_AUDIENCE,
			clockTolerance: 30, // 30-second skew tolerance per aithne local-verification-contract
			algorithms: ['ES256'], // pin to ES256 — defence-in-depth against algorithm confusion
		});
		const authorized = hasMediaManagerAccess(payload.scopes ?? []);
		return { authenticated: true, authorized, payload };
	} catch (error) {
		// Distinguish JWKS infrastructure failures (aithne unreachable, key rotation lag)
		// from JWT validation failures (bad signature, expired token, wrong audience).
		// JWKS errors indicate a service incident; JWT errors are expected noise.
		// Reaching here for a JWKS infra error means serve-stale (above) also failed:
		// either there was no last-known-good key set yet, or the kid genuinely isn'"'"'t in it.
		// Note: jose propagates raw Node network errors (ECONNREFUSED, ENOTFOUND) unwrapped
		// with no ERR_JWKS_* code — these must be caught explicitly as infra failures too.
		if (isJWKSInfraError(error)) {
			console.warn('JWKS infrastructure error (aithne unreachable or key mismatch):', error.message);
		} else {
			console.warn('JWT verification failed:', error.message);
		}
		return { authenticated: false, authorized: false };
	}
}

/**
 * Express middleware for checking authentication.
 * Three-branch pattern per consumer-migration-guide C2:
 *   1. Valid token + media-manager:use scope → proceed.
 *   2. Valid token, missing scope → render seinn's own styled 403 (no redirect —
 *      re-login yields the same scopeless token, causing an infinite loop).
 *   3. No/expired/invalid token → 302 redirect to aithne login.
 *      `next` is populated from the server-side request URL only (open-redirect guard).
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
		console.warn('JWT missing required media-manager:use scope:', result.payload?.sub);
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
	// Never reflect a user-supplied query parameter to prevent open-redirect attacks.
	const appOrigin = process.env.APP_ORIGIN ?? `${req.protocol}://${req.headers.host}`;
	const returnUrl = `${appOrigin}${req.originalUrl}`;
	return res.redirect(302, `${AITHNE_LOGIN_URL}?next=${encodeURIComponent(returnUrl)}`);
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
