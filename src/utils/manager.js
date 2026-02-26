let mediaManager;
let headers;

const { promise, resolve } = Promise.withResolvers();

const controller = new AbortController();
const signal = controller.signal;

export function init(mediaManagerValue, apiKey, userAgent) {
	mediaManager = mediaManagerValue;
	headers = new Headers();
	headers.set("Authorization", `Key ${apiKey}`);
	if (userAgent) {
		headers.set("User-Agent", userAgent);
	}
	resolve();
}
export function get(endpoint, options = {}) {
	return fetchFromManager(endpoint, 'GET', null, options);
}
export function put(endpoint, body) {
	return fetchFromManager(endpoint, 'PUT', body);
}
export function del(endpoint, body) { // Not called 'delete', because that's a reserved word in javascript
	return fetchFromManager(endpoint, 'DELETE', body);
}
export function post(endpoint, body) {
	return fetchFromManager(endpoint, 'POST', body);
}

async function fetchFromManager(endpoint, method, body, options = {}) {
	await promise;
	const url = mediaManager+endpoint;
	const fetchSignal = options.signal ? AbortSignal.any([signal, options.signal]) : signal;
	const response = await fetch(url, {
		method,
		headers,
		body,
		signal: fetchSignal,
	});
	if (!response.ok) throw new Error(`Unexpected response code ${response.status}.  ${await response.text()}`);
	return response
}

export function abortAllRequests(reason) {
	controller.abort(reason);
}