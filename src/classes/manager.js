let mediaManager;
let apiKey;

const controller = new AbortController();
const signal = controller.signal;

export function init(mediaManagerValue, apiKeyValue) {
	mediaManager = mediaManagerValue;
	apiKey = apiKeyValue;
}
export function get(endpoint) {
	return fetchFromManager(endpoint, 'GET', null);
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

function fetchFromManager(endpoint, method, body) {
	if (!mediaManager) throw "making request before manager module initiated";
	const url = mediaManager+endpoint;
	return fetch(url, {
		method,
		headers: {
			Authorization: `Key ${apiKey}`,
		},
		body,
		signal,
	});
}

export function abortAllRequests(reason) {
	controller.abort(reason);
}