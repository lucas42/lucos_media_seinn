import { listen, listenExisting } from 'lucos_pubsub';
import { getOutstandingRequests } from 'restful-queue';
import '../classes/poll.js';
import { getTrackState } from './preload.js';


const POLL_CACHE = 'polls-v1';
// This isn't a valid request, but it never hits the network, so the only
// thing that matters is consistency when reading and writing from cache
const pollRequest = new Request("POLL");

let listeners = [];
let pollData = { unloaded: true };

listenExisting("managerData", async serverData => {
	pollData = serverData;
	const outstandingRequests = await getOutstandingRequests();
	for (const request of outstandingRequests) {
		await enactAction(request);
	}
	for (const track of pollData.tracks) {
		track.state = await getTrackState(track.url);
	}
	dataChanged();
});

listenExisting("trackStateChange", async ({url}) => {
	const state = await getTrackState(url);
	for (const track of pollData.tracks) {
		if (track.url === url) track.state = state;
	}
	dataChanged();
});

/**
 * Gets invoked after any time pollData is modified
 * Iterates through any long polls waiting and returns the latest data
 * Also stores the data in cache to allow for service wokrer restarts
 */
function dataChanged() {
	let resolve;
	while (resolve = listeners.shift()) {
		resolve(getCurrentResponse());
	}
	saveToCache(getCurrentResponse());
}

function getCurrentResponse() {
	const body = JSON.stringify(pollData);
	const blob = new Blob([body]);
	return new Response(blob, {status: 200, type : 'application/json'});
}

/**
 * Called when a polling request hits the service worker
 * Either returns the current response (if the hashcode is out-of-date)
 * Or waits for a change in data before returning a response with the latest data
 */
export function getPoll(hashcode) {
	if (hashcode !== pollData.hashcode) {
		return getCurrentResponse();
	}
	return new Promise(resolve => {
		listeners.push(resolve);
	});
}

/**
 * Saves a given Response object into cache
 **/
async function saveToCache(pollResponse) {
	const pollCache = await caches.open(POLL_CACHE);
	await pollCache.put(pollRequest, pollResponse)
}
/**
 * Updates the pollData based on waht's currently in the cache
 * Note: as this function is asynchronous it's possbible (though unlikely) that data from the server
 * is returned before the cache data.  Therefore, only modifes anything if pollData hasn't been populated yet.
 **/
async function loadFromCache() {
	const pollCache = await caches.open(POLL_CACHE);
	const pollResponse = await pollCache.match(pollRequest);
	if (!pollResponse) return;
	const cacheData = await pollResponse.json();
	if (!pollData.unloaded) return;
	pollData = cacheData;
	dataChanged();
}

/**
 * Modifes pollData based on a given action request
 * NB: the calling function should call `dataChanged`
 * after all the relevant actions have been processed
 **/
async function enactAction(action) {
	const url = new URL(action.url);
	if (url.pathname.startsWith("/v3/")) {
		const pathparts = url.pathname.split('/');
		const params = new URLSearchParams(url.search);
		switch (action.method) {
			case 'PUT':
				const data = await action.text();
				switch (pathparts[2]) {
					case "is-playing":
						pollData.isPlaying = (data.toLowerCase() === "true");
						break;
					case "volume":
						pollData.volume = Number(data);
						break;
					case "device-names":
						const uuid = pathparts[3];
						pollData.devices.forEach(device => {
							if (device.uuid === uuid) {
								device.name = data;
							}
						});
						break;
					case "current-device":
						pollData.devices.forEach(device => {
							device.isCurrent = (device.uuid === data);
						});
						break;
					case "playlist":
						if (pathparts.length === 6 && pathparts[5] == "current-time") {
							const playlist = pathparts[3]; // Unused for now
							const uuid = pathparts[4];
							pollData.tracks.forEach(track => {
								if (track.uuid === uuid) {
									track.currentTime = data;
								}
							});
						} else {
							console.error("Unsupported v3 playlist url", url.pathname);
						}
						break;
					default:
						console.error("Unknown PUT request to endpoint", url.pathname);	
				}
				break;
			case 'DELETE':
				if (pathparts[2] === 'playlist') {
					if (pathparts.length === 5) {
						const playlist = pathparts[3]; // Unused for now
						const uuid = pathparts[4];
						const action = params.get("action"); // Not needed by service worker
						pollData.tracks = pollData.tracks.filter(track => track.uuid !== uuid);
					} else {
						console.error("Unsupported v3 playlist url", url.pathname);
					}
				} else {
					console.error("Unknown DELETE request to endpoint", url.pathname);
				}
				break;
			default:
				console.error("Unsupported method for v3 endpoint", url.method, url.pathname);
		}
	} else {
		console.error("Service Worker handling deprecated call to v2 media_manager endpoint", url.pathname);
		const params = new URLSearchParams(url.search);
		const update_url = params.get("update_url");
		const update_time = params.get("update_time");
		if (update_url && update_time) {
			pollData.tracks.forEach(track => {
				if (track.url == update_url) {
					track.currentTime = update_time;
				}
			});
		}

		const command = url.pathname.substring(1); // Remove leading slash from path
		switch (command) {
			case "volume":
				pollData.volume = params.get("volume");
				break;
			case "play":
				pollData.isPlaying = true;
				break;
			case "pause":
				pollData.isPlaying = false;
				break;
			case "next":
				pollData.tracks.shift();
				break;
			case "done":
				pollData.tracks = pollData.tracks.filter(track => track.url !== params.get("track"));
				break;
			case "devices":
				pollData.devices.forEach(device => {
					if (device.uuid === params.get("uuid")) {
						device.name = params.get("name");
					}
				});
				break;
			case "devices/current":
				pollData.devices.forEach(device => {
					device.isCurrent = (device.uuid === params.get("uuid"));
				});
				if (params.get("play") == "true") {
					pollData.isPlaying = true;
				}
				break;
			default:
				console.error("unknown action", command, params.toString());
		}
	}
}

/**
 * Modifies pollData with a single action
 * Shouldn't be called multiple times together as `dataChanged` gets triggered each time
 **/
export async function modifyPollData(action) {
	await enactAction(action);
	dataChanged();
}

/**
 * Service Worker won't shut down while there are polls open
 * Go through anything still listening, and resolve them
 */
export function freeUpConnections() {
	let resolve;
	while (resolve = listeners.shift()) {
		resolve(getCurrentResponse());
	}
}

let pollingState = 'closed';
const statusChannel = new BroadcastChannel("lucos_status");
listen("polling_connected", () => {
	pollingState = 'opened';
	statusChannel.postMessage("streaming-opened");
});
listen("polling_disconnected", () => {
	pollingState = 'closed';
	statusChannel.postMessage("streaming-closed");
});

// When a new client starts listening, resend the current polling state.
statusChannel.addEventListener('message', function statusMessageReceived(event) {
	if ("client-loaded" == event.data) {
		statusChannel.postMessage('streaming-'+pollingState);
	}
});


loadFromCache();