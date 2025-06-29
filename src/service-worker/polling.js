import { listen, listenExisting } from 'lucos_pubsub';
import { getOutstandingRequests } from 'restful-queue';
import '../classes/poll.js';
import { getTrackState } from './preload.js';
import { topupTracks } from './offline-collection.js';


const POLL_CACHE = 'polls-v1';
// This isn't a valid request, but it never hits the network, so the only
// thing that matters is consistency when reading and writing from cache
const pollRequest = new Request("POLL");
const offlinePollRequest = new Request("/offline/poll");

let listeners = [];
let pollData = { unloaded: true };

listenExisting("managerData", async serverData => {
	const pollCache = await caches.open(POLL_CACHE);
	const inOfflineMode = !!(await pollCache.match(offlinePollRequest));
	if (inOfflineMode) return dataChanged();
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

listenExisting("trackStateChange", async ({url, state}) => {
	for (const track of pollData.tracks) {
		if (track.url === url) track.state = state;
	}
	if (pollData.playOfflineCollection && state == "failed") {
		debugger;
		await topupTracks(pollData);
	}
	dataChanged();
});

/**
 * Gets invoked after any time pollData is modified
 * Iterates through any long polls waiting and returns the latest data
 * Also stores the data in cache to allow for service wokrer restarts
 */
async function dataChanged() {
	let resolve;
	while (resolve = listeners.shift()) {
		resolve(await getCurrentResponse());
	}
	await saveToCache(await getCurrentResponse());
}

async function getCurrentResponse() {
	pollData.offlineCollectionAvailable = true; // Lets the client know to add the offline collection to the collections-overlay component
	const body = JSON.stringify(pollData);
	const blob = new Blob([body]);
	return new Response(blob, {status: 200, type : 'application/json'});
}

/**
 * Called when a polling request hits the service worker
 * Either returns the current response (if the hashcode is out-of-date)
 * Or waits for a change in data before returning a response with the latest data
 */
export async function getPoll(hashcode) {
	if (hashcode !== pollData.hashcode) {
		return await getCurrentResponse();
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
	if (pollData.playOfflineCollection) await pollCache.put(offlinePollRequest, pollResponse);
	else await pollCache.put(pollRequest, pollResponse);
}
/**
 * Updates the pollData based on waht's currently in the cache
 * Note: as this function is asynchronous it's possbible (though unlikely) that data from the server
 * is returned before the cache data.  Therefore, only modifes anything if pollData hasn't been populated yet.
 **/
async function loadFromCache() {
	const pollCache = await caches.open(POLL_CACHE);
	const pollResponse = await pollCache.match(offlinePollRequest) || await pollCache.match(pollRequest);
	if (!pollResponse) return;
	const cacheData = await pollResponse.json();
	if (!pollData.unloaded) return;

	// If the offline collection is playing, ensure there's enough tracks in the playlist
	// (If it's not the offline collection, then this is the server's responsibility)
	if (cacheData.playOfflineCollection) {
		await topupTracks(cacheData);
	}
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

						// TODO: would be better to derive this from the `playlist` var above, once that's populated
						if (pollData.playOfflineCollection) {
							await topupTracks(pollData);
						}
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
	} else if (url.pathname.startsWith("/offline/")) {
		const pathparts = url.pathname.split('/');
		const params = new URLSearchParams(url.search);
		switch (action.method) {
			case 'PUT':
				const data = await action.text();
				switch (pathparts[2]) {
					case "play-collection":
						const pollCache = await caches.open(POLL_CACHE);
						const inOfflineMode = !!(await pollCache.match(offlinePollRequest));
						const updatedValue = (data.toLowerCase() === "true");
						if (inOfflineMode == updatedValue) return; // No need to do anything if already in the correct state
						if (updatedValue) {
							const body = JSON.stringify(Object.assign(pollData, {
								tracks: [],
								playOfflineCollection: true,
							}));
							await topupTracks(body);
							const blob = new Blob([body]);
							const pollResponse = new Response(blob, {status: 200, type : 'application/json'});
							await pollCache.put(offlinePollRequest, pollResponse);
						} else {
							// DEBUG: whilst the deletion does happen, the `await` doesn't seem to be making it synchronous
							await pollCache.delete(offlinePollRequest);
						}
						loadFromCache();
						break;
					default:
						console.error("Unknown PUT request to endpoint", url.pathname);
				}
				break;
			default:
				console.error("Unsupported method for offline endpoint", url.method, url.pathname);
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
export async function freeUpConnections() {
	let resolve;
	while (resolve = listeners.shift()) {
		resolve(await getCurrentResponse());
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