import assert from 'assert';
import { describe, it, beforeEach, afterEach } from 'mocha';
import {
	parseCookies,
	hasMediaManagerAccess,
	verifySessionToken,
	middleware,
	csrfMiddleware,
	_setVerifier,
} from '../src/server/auth.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq({ cookie, method = 'GET', originalUrl = '/', protocol = 'https', origin, referer } = {}) {
	return {
		headers: {
			host: 'ceol.l42.eu',
			...(cookie !== undefined && { cookie }),
			...(origin !== undefined && { origin }),
			...(referer !== undefined && { referer }),
		},
		method,
		originalUrl,
		protocol,
	};
}

function makeRes() {
	const res = {
		auth_agent: undefined,
		statusCode: 200,
		redirectCalls: [],
		renderCalls: [],
		jsonCalls: [],
	};
	res.redirect = (status, url) => res.redirectCalls.push({ status, url });
	res.status = (code) => { res.statusCode = code; return res; };
	res.render = (name, data) => { res.renderCalls.push({ name, data }); return res; };
	res.json = (data) => { res.jsonCalls.push(data); return res; };
	return res;
}

// Sentinel verifier — throws if called unexpectedly (prevents tests accidentally
// hitting the real JWKS endpoint).
const sentinelVerifier = () => {
	throw Object.assign(new Error('Test: real verifier should not be called'), { code: 'TEST_SENTINEL' });
};

// ─── parseCookies ─────────────────────────────────────────────────────────────

describe('parseCookies', function () {
	it('returns empty object for undefined header', function () {
		assert.deepStrictEqual(parseCookies(undefined), {});
	});

	it('returns empty object for empty string', function () {
		assert.deepStrictEqual(parseCookies(''), {});
	});

	it('parses a single cookie', function () {
		assert.deepStrictEqual(parseCookies('foo=bar'), { foo: 'bar' });
	});

	it('parses multiple cookies', function () {
		assert.deepStrictEqual(parseCookies('foo=bar; baz=qux'), { foo: 'bar', baz: 'qux' });
	});

	it('preserves = within cookie value (e.g. base64 JWT padding)', function () {
		assert.deepStrictEqual(
			parseCookies('aithne_session=abc.def.ghi=='),
			{ aithne_session: 'abc.def.ghi==' }
		);
	});

	it('only splits on the first = in a pair', function () {
		assert.deepStrictEqual(parseCookies('k=a=b=c'), { k: 'a=b=c' });
	});

	it('extracts aithne_session from a multi-cookie header', function () {
		const result = parseCookies('other=value; aithne_session=jwt.tok.en==; another=x');
		assert.strictEqual(result.aithne_session, 'jwt.tok.en==');
		assert.strictEqual(result.other, 'value');
		assert.strictEqual(result.another, 'x');
	});
});

// ─── hasMediaManagerAccess ────────────────────────────────────────────────────

describe('hasMediaManagerAccess', function () {
	let origEnv;

	beforeEach(function () {
		origEnv = process.env.ENVIRONMENT;
	});

	afterEach(function () {
		if (origEnv === undefined) {
			delete process.env.ENVIRONMENT;
		} else {
			process.env.ENVIRONMENT = origEnv;
		}
	});

	it('media-manager:use grants access', function () {
		assert.strictEqual(hasMediaManagerAccess(['media-manager:use']), true);
	});

	it('media-manager:use alongside other scopes grants access', function () {
		assert.strictEqual(hasMediaManagerAccess(['eolas:read', 'media-manager:use', 'webhook']), true);
	});

	it('empty scopes denies access', function () {
		assert.strictEqual(hasMediaManagerAccess([]), false);
	});

	it('unrelated scopes deny access', function () {
		assert.strictEqual(hasMediaManagerAccess(['eolas:read', 'notes:use']), false);
	});

	it('render-ui grants access in development', function () {
		process.env.ENVIRONMENT = 'development';
		assert.strictEqual(hasMediaManagerAccess(['render-ui']), true);
	});

	it('render-ui is denied in production', function () {
		process.env.ENVIRONMENT = 'production';
		assert.strictEqual(hasMediaManagerAccess(['render-ui']), false);
	});
});

// ─── verifySessionToken ───────────────────────────────────────────────────────

describe('verifySessionToken', function () {
	afterEach(function () {
		_setVerifier(sentinelVerifier);
	});

	it('no cookie header → not authenticated, not authorized', async function () {
		const result = await verifySessionToken(undefined);
		assert.strictEqual(result.authenticated, false);
		assert.strictEqual(result.authorized, false);
	});

	it('cookie header without aithne_session → not authenticated', async function () {
		const result = await verifySessionToken('other=value');
		assert.strictEqual(result.authenticated, false);
		assert.strictEqual(result.authorized, false);
	});

	it('valid JWT with media-manager:use → authenticated and authorized', async function () {
		const fakePayload = { sub: 'user:1', principal_class: 'human', scopes: ['media-manager:use'], exp: 9999999999 };
		_setVerifier(async () => ({ payload: fakePayload }));
		const result = await verifySessionToken('aithne_session=valid.jwt.token');
		assert.strictEqual(result.authenticated, true);
		assert.strictEqual(result.authorized, true);
		assert.deepStrictEqual(result.payload, fakePayload);
	});

	it('valid JWT missing media-manager:use → authenticated but not authorized', async function () {
		const fakePayload = { sub: 'user:2', principal_class: 'human', scopes: ['eolas:read'], exp: 9999999999 };
		_setVerifier(async () => ({ payload: fakePayload }));
		const result = await verifySessionToken('aithne_session=valid.jwt.no-scope');
		assert.strictEqual(result.authenticated, true);
		assert.strictEqual(result.authorized, false);
		assert.deepStrictEqual(result.payload, fakePayload);
	});

	it('valid JWT with empty scopes → authenticated but not authorized', async function () {
		const fakePayload = { sub: 'user:3', scopes: [], exp: 9999999999 };
		_setVerifier(async () => ({ payload: fakePayload }));
		const result = await verifySessionToken('aithne_session=valid.jwt.empty-scopes');
		assert.strictEqual(result.authenticated, true);
		assert.strictEqual(result.authorized, false);
	});

	it('expired JWT → not authenticated, not authorized', async function () {
		_setVerifier(async () => {
			throw Object.assign(new Error('JWTExpired'), { code: 'ERR_JWT_EXPIRED' });
		});
		const result = await verifySessionToken('aithne_session=expired.jwt.token');
		assert.strictEqual(result.authenticated, false);
		assert.strictEqual(result.authorized, false);
	});

	it('tampered JWT → not authenticated, not authorized', async function () {
		_setVerifier(async () => {
			throw Object.assign(new Error('JWSSignatureVerificationFailed'), { code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' });
		});
		const result = await verifySessionToken('aithne_session=tampered.jwt.token');
		assert.strictEqual(result.authenticated, false);
		assert.strictEqual(result.authorized, false);
	});
});

// ─── middleware ───────────────────────────────────────────────────────────────

describe('middleware', function () {
	let origConsoleWarn;

	beforeEach(function () {
		origConsoleWarn = console.warn;
		console.warn = () => {};
	});

	afterEach(function () {
		_setVerifier(sentinelVerifier);
		console.warn = origConsoleWarn;
	});

	// Branch 1: valid token + media-manager:use scope → proceed
	it('valid JWT with media-manager:use → calls next() and sets res.auth_agent', async function () {
		const fakePayload = { sub: 'user:1', principal_class: 'human', scopes: ['media-manager:use'], exp: 9999999999 };
		_setVerifier(async () => ({ payload: fakePayload }));
		const req = makeReq({ cookie: 'aithne_session=valid.jwt.token' });
		const res = makeRes();
		let nextCalled = false;

		await middleware(req, res, () => { nextCalled = true; });

		assert.strictEqual(nextCalled, true, 'next() should be called for an authorised request');
		assert.strictEqual(res.redirectCalls.length, 0, 'should not redirect an authorised request');
		assert.strictEqual(res.renderCalls.length, 0, 'should not render for an authorised request');
		assert.deepStrictEqual(res.auth_agent, fakePayload);
	});

	// Branch 2: valid token, missing scope → render styled 403, no redirect
	it('valid JWT missing media-manager:use → renders error page with 403, does not redirect', async function () {
		const fakePayload = { sub: 'user:2', principal_class: 'human', scopes: ['eolas:read'], exp: 9999999999 };
		_setVerifier(async () => ({ payload: fakePayload }));
		const req = makeReq({ cookie: 'aithne_session=valid.jwt.no-scope' });
		const res = makeRes();
		let nextCalled = false;

		await middleware(req, res, () => { nextCalled = true; });

		assert.strictEqual(nextCalled, false, 'next() must not be called when scope is missing');
		assert.strictEqual(res.redirectCalls.length, 0, 'should not redirect when scope is missing');
		assert.strictEqual(res.statusCode, 403);
		assert.strictEqual(res.renderCalls.length, 1);
		assert.strictEqual(res.renderCalls[0].name, 'error');
		assert.ok(typeof res.renderCalls[0].data.message === 'string' && res.renderCalls[0].data.message.length > 0,
			'render data should include a non-empty message');
	});

	// Branch 3: no/expired/invalid token → redirect to aithne login
	it('no cookie → redirects to aithne login', async function () {
		const req = makeReq();
		const res = makeRes();
		let nextCalled = false;

		await middleware(req, res, () => { nextCalled = true; });

		assert.strictEqual(nextCalled, false);
		assert.strictEqual(res.renderCalls.length, 0);
		assert.strictEqual(res.redirectCalls.length, 1);
		const { status, url } = res.redirectCalls[0];
		assert.strictEqual(status, 302);
		assert.ok(url.includes('/auth/login?next='), `redirect URL should contain /auth/login?next=, got: ${url}`);
	});

	it('unauthenticated redirect encodes the server-side URL into next param', async function () {
		const req = makeReq({ protocol: 'https', originalUrl: '/v3/?filter=active' });
		const res = makeRes();

		await middleware(req, res, () => {});

		assert.strictEqual(res.redirectCalls.length, 1);
		const { url } = res.redirectCalls[0];
		const returnUrl = decodeURIComponent(new URL(url).searchParams.get('next'));
		assert.ok(returnUrl.startsWith('https://'), `returnUrl should start with https://, got: ${returnUrl}`);
		assert.ok(returnUrl.includes('/v3/?filter=active'), `returnUrl should contain the path, got: ${returnUrl}`);
	});

	it('expired JWT → redirects to login', async function () {
		_setVerifier(async () => {
			throw Object.assign(new Error('JWTExpired'), { code: 'ERR_JWT_EXPIRED' });
		});
		const req = makeReq({ cookie: 'aithne_session=expired.jwt.token' });
		const res = makeRes();
		let nextCalled = false;

		await middleware(req, res, () => { nextCalled = true; });

		assert.strictEqual(nextCalled, false);
		assert.strictEqual(res.redirectCalls.length, 1);
		assert.strictEqual(res.renderCalls.length, 0);
	});

	it('tampered JWT → redirects to login', async function () {
		_setVerifier(async () => {
			throw Object.assign(new Error('JWSSignatureVerificationFailed'), { code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' });
		});
		const req = makeReq({ cookie: 'aithne_session=tampered.jwt.token' });
		const res = makeRes();
		let nextCalled = false;

		await middleware(req, res, () => { nextCalled = true; });

		assert.strictEqual(nextCalled, false);
		assert.strictEqual(res.redirectCalls.length, 1);
	});
});

// ─── csrfMiddleware ───────────────────────────────────────────────────────────

describe('csrfMiddleware', function () {
	let origEnv;

	beforeEach(function () {
		origEnv = process.env.ENVIRONMENT;
	});

	afterEach(function () {
		if (origEnv === undefined) {
			delete process.env.ENVIRONMENT;
		} else {
			process.env.ENVIRONMENT = origEnv;
		}
	});

	it('GET request → passes through (no CSRF risk)', function () {
		const req = makeReq({ method: 'GET' });
		const res = makeRes();
		let nextCalled = false;
		csrfMiddleware(req, res, () => { nextCalled = true; });
		assert.strictEqual(nextCalled, true);
		assert.strictEqual(res.statusCode, 200, 'should not set error status');
	});

	it('POST with *.l42.eu Origin → allowed', function () {
		const req = makeReq({ method: 'POST', origin: 'https://ceol.l42.eu' });
		const res = makeRes();
		let nextCalled = false;
		csrfMiddleware(req, res, () => { nextCalled = true; });
		assert.strictEqual(nextCalled, true);
	});

	it('POST with other l42.eu subdomain Origin → allowed', function () {
		const req = makeReq({ method: 'POST', origin: 'https://other.l42.eu' });
		const res = makeRes();
		let nextCalled = false;
		csrfMiddleware(req, res, () => { nextCalled = true; });
		assert.strictEqual(nextCalled, true);
	});

	it('POST with evil.com Origin → rejected with 403', function () {
		process.env.ENVIRONMENT = 'production';
		const req = makeReq({ method: 'POST', origin: 'https://evil.com' });
		const res = makeRes();
		let nextCalled = false;
		csrfMiddleware(req, res, () => { nextCalled = true; });
		assert.strictEqual(nextCalled, false);
		assert.strictEqual(res.statusCode, 403);
	});

	it('POST with l42.eu Referer (no Origin header) → allowed', function () {
		const req = makeReq({ method: 'POST', referer: 'https://ceol.l42.eu/' });
		const res = makeRes();
		let nextCalled = false;
		csrfMiddleware(req, res, () => { nextCalled = true; });
		assert.strictEqual(nextCalled, true);
	});

	it('POST with evil.com Referer (no Origin header) → rejected with 403', function () {
		process.env.ENVIRONMENT = 'production';
		const req = makeReq({ method: 'POST', referer: 'https://evil.com/phishing' });
		const res = makeRes();
		let nextCalled = false;
		csrfMiddleware(req, res, () => { nextCalled = true; });
		assert.strictEqual(nextCalled, false);
		assert.strictEqual(res.statusCode, 403);
	});

	it('POST with no Origin and no Referer → allowed (same-origin request)', function () {
		const req = makeReq({ method: 'POST' });
		const res = makeRes();
		let nextCalled = false;
		csrfMiddleware(req, res, () => { nextCalled = true; });
		assert.strictEqual(nextCalled, true);
	});

	it('POST with localhost Origin in development → allowed', function () {
		process.env.ENVIRONMENT = 'development';
		const req = makeReq({ method: 'POST', origin: 'http://localhost:8009' });
		const res = makeRes();
		let nextCalled = false;
		csrfMiddleware(req, res, () => { nextCalled = true; });
		assert.strictEqual(nextCalled, true);
	});

	it('POST with localhost Origin in production → rejected with 403', function () {
		process.env.ENVIRONMENT = 'production';
		const req = makeReq({ method: 'POST', origin: 'http://localhost:8009' });
		const res = makeRes();
		let nextCalled = false;
		csrfMiddleware(req, res, () => { nextCalled = true; });
		assert.strictEqual(nextCalled, false);
		assert.strictEqual(res.statusCode, 403);
	});
});
