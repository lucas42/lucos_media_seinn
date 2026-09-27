import assert from 'assert';
import { describe, it } from 'mocha';
import { classifyStall } from '../src/server/probe-timing.js';

// classifyStall is a pure function over a timeline snapshot — these tests
// don't touch diagnostics_channel or the network, only synthetic timelines.
// The channel wiring itself was verified against the running production
// image (see lucas42/lucos_media_seinn#583) and isn't network-testable here.

describe('classifyStall', () => {
	it('waiting-for-response — headers sent to media_manager but no response yet', () => {
		const timeline = { headersSent: 100, responseHeaders: null, sockets: [] };
		const result = classifyStall(timeline, /* probeStart */ 0, /* now */ 800);
		assert.equal(result.phase, 'waiting-for-response');
		assert.equal(result.detail, '700ms');
	});

	it('dns — a socket opened during the probe with no lookup result yet', () => {
		const timeline = {
			headersSent: null,
			responseHeaders: null,
			sockets: [{ created: 50, lookup: null, connect: null, tls: null }],
		};
		const result = classifyStall(timeline, /* probeStart */ 0);
		assert.equal(result.phase, 'dns');
	});

	it('tcp-connect — lookup resolved but the socket hasn\'t connected yet', () => {
		const timeline = {
			headersSent: null,
			responseHeaders: null,
			sockets: [{ created: 50, lookup: { host: 'ceol.l42.eu', address: '178.32.218.44' }, connect: null, tls: null }],
		};
		const result = classifyStall(timeline, 0);
		assert.equal(result.phase, 'tcp-connect');
		assert.equal(result.detail, 'host: ceol.l42.eu');
	});

	it('tls — connected but the TLS handshake hasn\'t completed yet', () => {
		const timeline = {
			headersSent: null,
			responseHeaders: null,
			sockets: [{ created: 50, lookup: { host: 'ceol.l42.eu', address: '178.32.218.44' }, connect: 60, tls: null }],
		};
		const result = classifyStall(timeline, 0);
		assert.equal(result.phase, 'tls');
		assert.equal(result.detail, 'host: ceol.l42.eu');
	});

	it('queued — no headers sent, and no in-progress socket for this probe window', () => {
		const timeline = { headersSent: null, responseHeaders: null, sockets: [] };
		const result = classifyStall(timeline, 0);
		assert.equal(result.phase, 'queued');
	});

	it('ignores sockets that predate the probe (leftover from an earlier request)', () => {
		const timeline = {
			headersSent: null,
			responseHeaders: null,
			sockets: [{ created: 10, lookup: null, connect: null, tls: null }],
		};
		// probeStart is after the stale socket was created
		const result = classifyStall(timeline, /* probeStart */ 20);
		assert.equal(result.phase, 'queued');
	});

	it('ignores sockets that already completed their TLS handshake', () => {
		const timeline = {
			headersSent: null,
			responseHeaders: null,
			sockets: [{ created: 50, lookup: { host: 'ceol.l42.eu' }, connect: 60, tls: 70 }],
		};
		const result = classifyStall(timeline, 0);
		assert.equal(result.phase, 'queued');
	});

	it('waiting-for-response takes priority over an unrelated in-progress socket', () => {
		const timeline = {
			headersSent: 100,
			responseHeaders: null,
			sockets: [{ created: 50, lookup: null, connect: null, tls: null }],
		};
		const result = classifyStall(timeline, 0, 500);
		assert.equal(result.phase, 'waiting-for-response');
	});
});
