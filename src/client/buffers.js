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
		let rawtrack;
		let arrayBuffer;
		try {
			rawtrack = await fetch(url, { headers: await getMediaHeaders() });
			setState("buffering");
			arrayBuffer = await rawtrack.arrayBuffer();
			setState("decoding");
			const buffer = await audioContext.decodeAudioData(arrayBuffer);
			setState("ready");
			return buffer;
		} catch (err) {
			// Attach diagnostics so the caller (web-player.js) can include them in
			// the playback-error envelope without re-deriving values that only exist
			// in this scope.
			err.decodeContextState = audioContext.state;
			if (rawtrack != null) {
				err.responseStatus      = rawtrack.status;
				err.responseContentType = rawtrack.headers?.get('content-type') ?? null;
			}
			if (arrayBuffer != null) {
				err.responseByteLength = arrayBuffer.byteLength;
			}
			throw err;
		}
	}
	if (!(url in buffers)) {
		buffers[url] = {};
		const promise = bufferTrack(url);
		// Don't cache rejected promises: if the fetch/decode fails, evict the
		// entry so the next call starts a fresh attempt rather than returning the
		// same stale rejection indefinitely.
		promise.catch(() => {
			delete buffers[url];
		});
		buffers[url].buffer = promise;
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
		// Attach a catch handler to suppress unhandled-rejection warnings.
		// Cache eviction on failure is handled inside getBuffer itself.
		getBuffer(track.url).catch(() => {});
	});
}

/**
 * Resets all cached buffers — intended for use in tests only.
 */
export function _resetBuffersForTest() {
	for (const key of Object.keys(buffers)) {
		delete buffers[key];
	}
}

export function getState(url) {
	if (!(url in buffers)) return null;
	return buffers[url].state;
}
