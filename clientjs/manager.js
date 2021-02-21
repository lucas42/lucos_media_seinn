const currentDevice = require("./current-device");
let mediaManager = undefined;
let getTimeElapsed = () => undefined;
let getCurrentTrack = () => undefined;

function init(mediaManagerValue) {
	mediaManager = mediaManagerValue;
}

/**
 * The functions for checking the current status of play varies by player
 * Therefore, let each player set these when they're ready
 **/
function setUpdateFunctions(timeElapsed, currentTrack) {
	getTimeElapsed = timeElapsed;
	getCurrentTrack = currentTrack;
}

/**
 * Returns some standard GET parameters to include in all requests
 * so that server knows the current state of play
 */
function _getUpdateParams() {
	const params = new URLSearchParams();
	params.set("device", currentDevice.getUuid());

	const timeElapsed = getTimeElapsed();
	const currentTrack = getCurrentTrack();
	if (timeElapsed === undefined || currentTrack === undefined) return params;
	params.set("update_url", currentTrack);
	params.set("update_time", timeElapsed);
	params.set("update_timeset", new Date().getTime());
	return params;
}

function _makeRequestToManager(endpoint, method, parameters={}) {
	if (!mediaManager) throw "making request before manager module initiated";
	const searchParams = _getUpdateParams();
	for (const [key, value] of Object.entries(parameters)) {
		if (value === null || value === undefined) continue;
		searchParams.set(key, value);
	}
	let url = mediaManager+endpoint;
	if (searchParams.toString()) url += "?" + searchParams.toString();
	return fetch(url, {method})
}

function post(endpoint, parameters={}) {
	_makeRequestToManager(endpoint, 'post', parameters);
}

async function getJson(endpoint, parameters={}) {
	const response = await _makeRequestToManager(endpoint, 'get', parameters);
	return response.json();
}

module.exports = {init, getJson, post, setUpdateFunctions};