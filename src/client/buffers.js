import { send } from 'lucos_pubsub';
import { getMediaHeaders } from '../utils/media-headers.js';

const buffers = {};
const audioContext = new AudioContext();

/**
 * Fetches a given audio url from the network and buffers it
 * If called more than once for the same url, subsequent calls will return from an in-memory cache
 * Returns a promise which fulfils with an AudioBuffer for the given url
 */
export function getBuffer(url) {
	function setState(state) {
		buffers[url].state = state;
		send('trackStateChange', {url, state});
	}
	async function bufferTrack() {
		setState("fetching");
		const rawtrack = await fetch(url, { headers: getMediaHeaders() });
		setState("buffering");
		const arrayBuffer = await rawtrack.arrayBuffer();
		setState("decoding");
		const buffer = await audioContext.decodeAudioData(arrayBuffer);
		setState("ready");
		return buffer;
	}
	if (!(url in buffers)) {
		buffers[url] = {};
		buffers[url].buffer = bufferTrack(url);
	}
	return buffers[url].buffer;
}

/**
 * Starts to buffer the first $count tracks from the $tracks array
 * Buffering happens asynchronously and nothing is returned
 * To actually use a buffer, call getBuffer instead
 */
export function preBufferTracks(tracks, count) {
	tracks.slice(0, count).forEach(track => {
		getBuffer(track.url).catch(() => {
			// If something fails whilst pre-buffering, clear the cached buffer
			// so that it'll try again from scratch when playing
			delete buffers[track.url];
		});
	});
}

export function getState(url) {
	if (!(url in buffers)) return null;
	return buffers[url].state;
}
