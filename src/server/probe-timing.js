import diagnosticsChannel from 'node:diagnostics_channel';

// Path the media-manager probe is tagged with (see v3.js's `_info` handler).
// media_manager ignores unknown query params, so this only serves to make the
// probe's own request identifiable here and in the router access log.
export const PROBE_PATH = '/v3/poll?probe=1';

// How long to keep a socket's timing around after it's opened. Bounds memory
// for a long-lived process without needing to know when a socket is "done".
const SOCKET_RETENTION_MS = 5000;

let probeRequest = null;
let headersSentAt = null;
let responseHeadersAt = null;
const sockets = [];

function pruneSockets(now) {
	while (sockets.length > 0 && now - sockets[0].created > SOCKET_RETENTION_MS) {
		sockets.shift();
	}
}

// Fires for every outbound client socket, not just the probe's — deliberate,
// since undici's connection pool can hand the probe a socket opened by
// another request already mid-setup (see classifyStall).
diagnosticsChannel.subscribe('net.client.socket', ({ socket }) => {
	const now = performance.now();
	pruneSockets(now);
	const entry = { created: now, lookup: null, connect: null, tls: null };
	sockets.push(entry);
	socket.once('lookup', (err, address, family, host) => {
		entry.lookup = { host, address, errCode: err?.code };
	});
	socket.once('connect', () => {
		entry.connect = performance.now();
	});
	socket.once('secureConnect', () => {
		entry.tls = performance.now();
	});
});

diagnosticsChannel.subscribe('undici:request:create', ({ request }) => {
	if (request.path === PROBE_PATH) {
		probeRequest = request;
		headersSentAt = null;
		responseHeadersAt = null;
	}
});

diagnosticsChannel.subscribe('undici:client:sendHeaders', ({ request }) => {
	if (request === probeRequest) headersSentAt = performance.now();
});

diagnosticsChannel.subscribe('undici:request:headers', ({ request }) => {
	if (request === probeRequest) responseHeadersAt = performance.now();
});

/**
 * Snapshot of everything recorded so far, for classifyStall to read after a
 * probe failure. Returns plain data (no live references) so it's safe to
 * pass into a pure function or log as JSON.
 */
export function getProbeTimeline() {
	return {
		headersSent: headersSentAt,
		responseHeaders: responseHeadersAt,
		sockets: sockets.map(socket => ({ ...socket })),
	};
}

/**
 * Pure function: given a timeline snapshot and when the probe started,
 * decides which phase the stall was in. First match wins.
 *
 * @param {{ headersSent: number|null, responseHeaders: number|null, sockets: object[] }} timeline
 * @param {number} probeStart - performance.now() value when the probe request was made
 * @param {number} [now] - performance.now() value at classification time (defaults to now)
 * @returns {{ phase: 'waiting-for-response'|'dns'|'tcp-connect'|'tls'|'queued', detail?: string }}
 */
export function classifyStall(timeline, probeStart, now = performance.now()) {
	const { headersSent, responseHeaders, sockets: socketList = [] } = timeline;

	// Request reached media_manager — the time went to it or the path back.
	if (headersSent && !responseHeaders) {
		return { phase: 'waiting-for-response', detail: `${Math.round(now - headersSent)}ms` };
	}

	// Not attributing a socket to the probe's own request specifically —
	// undici's pool can hand the probe a connection another request opened,
	// so any socket stuck mid-setup during the probe window is stuck in the
	// step that matters.
	const pending = socketList.filter(socket => socket.created >= probeStart && !socket.tls);
	if (pending.length > 0) {
		const earliest = pending.reduce((a, b) => (a.created <= b.created ? a : b));
		const host = earliest.lookup?.host;
		if (!earliest.lookup) return { phase: 'dns' };
		if (!earliest.connect) return { phase: 'tcp-connect', detail: host ? `host: ${host}` : undefined };
		return { phase: 'tls', detail: host ? `host: ${host}` : undefined };
	}

	return { phase: 'queued' };
}
