import assert from 'assert';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { isAuthenticated, middleware } from '../src/server/auth.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Express-like request object.
 *
 * @param {object} opts
 * @param {string}  opts.cookieStr  Raw Cookie header value (default: '')
 * @param {string}  opts.queryToken Token supplied as ?token= query param
 * @param {string}  opts.host       Host header (default: 'media.l42.eu')
 * @param {string}  opts.path       originalUrl (default: '/')
 */
function makeReq({ cookieStr = '', queryToken, host = 'media.l42.eu', path = '/' } = {}) {
	const query = {};
	if (queryToken !== undefined) query.token = queryToken;
	return {
		headers: { cookie: cookieStr, host },
		query,
		originalUrl: path,
	};
}

/**
 * Build a minimal Express-like response object that records calls to
 * redirect() and cookie() for later assertion.
 */
function makeRes() {
	const res = {
		redirectCalls: [],
		cookieCalls: [],
	};
	res.redirect = (status, url) => res.redirectCalls.push({ status, url });
	res.cookie = (name, value) => res.cookieCalls.push({ name, value });
	return res;
}

// ---------------------------------------------------------------------------
// isAuthenticated() unit tests
// ---------------------------------------------------------------------------

describe('isAuthenticated', function () {
	let originalFetch;
	let originalConsoleError;

	beforeEach(function () {
		originalFetch = global.fetch;
		originalConsoleError = console.error;
		// Suppress expected "Failed to auth" noise from error-path tests
		console.error = () => {};
	});

	afterEach(function () {
		global.fetch = originalFetch;
		console.error = originalConsoleError;
	});

	it('returns false immediately for a missing token without calling the auth server', async function () {
		let fetchCalled = false;
		global.fetch = () => { fetchCalled = true; };

		assert.strictEqual(await isAuthenticated(undefined), false);
		assert.strictEqual(await isAuthenticated(null), false);
		assert.strictEqual(await isAuthenticated(''), false);
		assert.strictEqual(fetchCalled, false, 'fetch should not be called for missing tokens');
	});

	it('returns true and calls the auth server for a valid token', async function () {
		const callLog = [];
		global.fetch = async (url) => {
			callLog.push(url);
			return {
				status: 200,
				json: async () => ({ user: 'alice' }),
			};
		};

		assert.strictEqual(await isAuthenticated('valid-token-seinn-a'), true);
		assert.strictEqual(callLog.length, 1);
		assert.strictEqual(callLog[0], 'https://auth.l42.eu/data?token=valid-token-seinn-a');
	});

	it('returns false when the auth server responds with a non-200 status', async function () {
		global.fetch = async () => ({ status: 401 });
		assert.strictEqual(await isAuthenticated('rejected-token-seinn-a'), false);
	});

	it('returns false when the auth server request throws', async function () {
		global.fetch = async () => { throw new Error('Network error'); };
		assert.strictEqual(await isAuthenticated('error-token-seinn-a'), false);
	});
});

// ---------------------------------------------------------------------------
// middleware() integration tests
// ---------------------------------------------------------------------------

describe('middleware', function () {
	let originalFetch;
	let originalConsoleError;

	beforeEach(function () {
		originalFetch = global.fetch;
		originalConsoleError = console.error;
		// Suppress expected "Failed to auth" noise from error-path tests
		console.error = () => {};
	});

	afterEach(function () {
		global.fetch = originalFetch;
		console.error = originalConsoleError;
	});

	it('calls next() and sets res.auth_agent for a request with a valid session cookie', async function () {
		global.fetch = async () => ({
			status: 200,
			json: async () => ({ user: 'alice' }),
		});
		const req = makeReq({ cookieStr: 'auth_token=cookie-token-seinn-b' });
		const res = makeRes();
		let nextCalled = false;

		await middleware(req, res, () => { nextCalled = true; });

		assert.strictEqual(nextCalled, true, 'next() should be called for an authenticated request');
		assert.strictEqual(res.redirectCalls.length, 0, 'should not redirect an authenticated request');
		assert.deepStrictEqual(res.auth_agent, { user: 'alice' }, 'res.auth_agent should be set to the agent data');
	});

	it('redirects a request with a missing cookie to the auth login page', async function () {
		const req = makeReq({ cookieStr: '' });
		const res = makeRes();
		let nextCalled = false;

		await middleware(req, res, () => { nextCalled = true; });

		assert.strictEqual(nextCalled, false, 'next() must not be called for an unauthenticated request');
		assert.strictEqual(res.redirectCalls.length, 1, 'should redirect exactly once');
		assert.strictEqual(res.redirectCalls[0].status, 302);
		assert.ok(
			res.redirectCalls[0].url.startsWith('https://auth.l42.eu/authenticate'),
			'redirect should point to auth.l42.eu/authenticate'
		);
	});

	it('encodes the correct redirect_uri in the login redirect URL', async function () {
		const req = makeReq({ cookieStr: '', host: 'media.l42.eu', path: '/my-playlist' });
		const res = makeRes();

		await middleware(req, res, () => {});

		assert.strictEqual(res.redirectCalls.length, 1);
		const { status, url } = res.redirectCalls[0];
		assert.strictEqual(status, 302);

		const parsed = new URL(url);
		assert.strictEqual(parsed.origin + parsed.pathname, 'https://auth.l42.eu/authenticate');

		const redirectUri = decodeURIComponent(parsed.searchParams.get('redirect_uri'));
		assert.ok(redirectUri.includes('media.l42.eu'), 'redirect_uri should contain the request host');
		assert.ok(redirectUri.includes('/my-playlist'), 'redirect_uri should contain the request path');
	});

	it('redirects a request with an invalid session cookie to the auth login page', async function () {
		global.fetch = async () => ({ status: 403 });
		const req = makeReq({ cookieStr: 'auth_token=invalid-token-seinn-b' });
		const res = makeRes();
		let nextCalled = false;

		await middleware(req, res, () => { nextCalled = true; });

		assert.strictEqual(nextCalled, false, 'next() must not be called for a rejected token');
		assert.strictEqual(res.redirectCalls.length, 1);
		assert.strictEqual(res.redirectCalls[0].status, 302);
		assert.ok(res.redirectCalls[0].url.startsWith('https://auth.l42.eu/authenticate'));
	});

	it('persists a query-param token as a cookie for subsequent requests', async function () {
		global.fetch = async () => ({
			status: 200,
			json: async () => ({ user: 'bob' }),
		});
		// Token in query string only — not already in cookie
		const req = makeReq({ cookieStr: '', queryToken: 'query-token-seinn-b' });
		const res = makeRes();
		let nextCalled = false;

		await middleware(req, res, () => { nextCalled = true; });

		assert.strictEqual(nextCalled, true);
		assert.strictEqual(res.cookieCalls.length, 1, 'auth_token cookie should be set');
		assert.strictEqual(res.cookieCalls[0].name, 'auth_token');
		assert.strictEqual(res.cookieCalls[0].value, 'query-token-seinn-b');
	});

	it('does not reset the cookie when the token already matches what is in the cookie', async function () {
		global.fetch = async () => ({
			status: 200,
			json: async () => ({ user: 'carol' }),
		});
		// Token in both cookie and query — already present, should not be re-set
		const req = makeReq({ cookieStr: 'auth_token=same-token-seinn-b', queryToken: 'same-token-seinn-b' });
		const res = makeRes();
		let nextCalled = false;

		await middleware(req, res, () => { nextCalled = true; });

		assert.strictEqual(nextCalled, true);
		assert.strictEqual(res.cookieCalls.length, 0, 'cookie should not be re-set when it already matches');
	});
});
