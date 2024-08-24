let mediaManager = undefined;
let getTimeElapsed = () => undefined;
let getCurrentTrack = () => undefined;

const controller = new AbortController();
const signal = controller.signal;

export function init(mediaManagerValue) {
	mediaManager = mediaManagerValue;
}

/**
 * The functions for checking the current status of play varies by player
 * Therefore, let each player set these when they're ready
 **/
export function setUpdateFunctions(timeElapsed, currentTrack) {
	// TODO: currently unused - need to reimplement logic for them with v3 API
	getTimeElapsed = timeElapsed;
	getCurrentTrack = currentTrack;
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