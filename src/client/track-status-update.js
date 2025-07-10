import player from './player.js';
import { put } from '../classes/manager.js';
import { listenExisting } from 'lucos_pubsub';


export async function updateTrackStatus() {
	const timeElapsed = player.getTimeElapsed();
	const currentUuid = player.getCurrentUuid();
	if (!currentUuid) return;

	const playlist = 'null'; // For now, the playlist slug isn't used (but needs to be part of the url).  Set it to null until there's an easier way to derive it.
	await put(`v3/playlist/${playlist}/${currentUuid}/current-time`, timeElapsed);
}

// Aside from any event triggers to updating tracks status, automatically update it every 30 seconds at the very least
function periodicStatusUpdate() {
	updateTrackStatus();
	setTimeout(periodicStatusUpdate, 30*1000);
}
periodicStatusUpdate();


// If playback is moving from this device to another, ensure the latest track status is sent to the server
listenExisting('device_notcurrent', updateTrackStatus);
listenExisting('device_changing', updateTrackStatus);
listenExisting('playpause_changing', updateTrackStatus);