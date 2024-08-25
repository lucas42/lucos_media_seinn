let mediaManager = undefined;
let getTimeElapsed = () => undefined;
let getCurrentTrack = () => undefined;

const controller = new AbortController();
const signal = controller.signal;

export function init(mediaManagerValue) {
	mediaManager = mediaManagerValue;
}
export function get(endpoint) {
	if (!mediaManager) throw "making request before manager module initiated";
	const url = mediaManager+endpoint;
	return fetch(url, {method: 'GET', signal});
}
export function put(endpoint, body) {
	if (!mediaManager) throw "making request before manager module initiated";
	const url = mediaManager+endpoint;
	return fetch(url, {method: 'PUT', body, signal});
}
export function del(endpoint, body) { // Not called 'delete', because that's a reserved word in javascript
	if (!mediaManager) throw "making request before manager module initiated";
	const url = mediaManager+endpoint;
	return fetch(url, {method: 'DELETE', body, signal});
}

export function abortAllRequests(reason) {
	controller.abort(reason);
}