const pubsub = require("../pubsub");
const actions = require("./actions");
require("../poll");
const { getTrackState } = require("./preload");

let listeners = [];
let pollData = {};

pubsub.listenExisting("managerData", async serverData => {
	pollData = serverData;
	actions.getQueue()
		.forEach(enactAction);
	for (const track of pollData.tracks) {
		track.state = await getTrackState(track.url);
	}
	dataChanged();
});

pubsub.listenExisting("trackStateChange", async ({url}) => {
	const state = await getTrackState(url);
	for (const track of pollData.tracks) {
		if (track.url === url) track.state = state;
	}
	dataChanged();
});

function dataChanged() {
	let resolve;
	while (resolve = listeners.shift()) {
		resolve(getCurrentResponse());
	}
}

function getCurrentResponse() {
	const body = JSON.stringify(pollData);
	const blob = new Blob([body]);
	return new Response(blob, {status: 200, type : 'application/json'});
}

function getPoll(hashcode) {
	if (hashcode !== pollData.hashcode) {
		return getCurrentResponse();
	}
	return new Promise(resolve => {
		listeners.push(resolve);
	});
}

function enactAction(action) {
	const url = new URL(action.url);
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
			break;
		default:
			console.error("unknown action", command, params.toString());
	}
}
function modifyPollData(action) {
	enactAction(action);
	dataChanged();
}

module.exports = {getPoll, modifyPollData};