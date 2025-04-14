import express from 'express';
import * as manager from '../classes/manager.js';
import fs from 'node:fs/promises';

const router = express.Router();

const mediaManager = process.env.MEDIA_MANAGER_URL || (() => { throw "MEDIA_MANAGER_URL Environment Variable not set" })();
const apiKey = process.env.KEY_LUCOS_MEDIA_MANAGER || (() => { throw "KEY_LUCOS_MEDIA_MANAGER Environment Variable not set" })();
manager.init(mediaManager, apiKey);
const clientVariables = JSON.stringify({
	mediaManager,
	apiKey,
});

router.get('/', async (req, res) => {
	try {
		const data = await manager.get("v3/poll").then(resp => resp.json());
		const now = data.tracks.shift();
		res.render("index", {
			clientVariables,
			now,
			playlist: data.tracks,
			isPlaying: data.isPlaying,
			volumeUp: Math.min(1, data.volume+0.1),
			volumeDown: Math.max(0, data.volume-0.1),
		});
	} catch (exception) {
		console.warn("Failed to fetch poll from the server", exception);
		res.render("index", {
			clientVariables,
		});
	}
});

router.post('/play', async (req,res) => {
	await manager.put("v3/is-playing", "true");
	res.redirect(`${req.protocol}://${req.headers.host}/`);
});
router.post('/pause', async (req,res) => {
	await manager.put("v3/is-playing", "false");
	res.redirect(`${req.protocol}://${req.headers.host}/`);
});
router.post('/next', async (req,res) => {
	await manager.post("v3/skip-track");
	res.redirect(`${req.protocol}://${req.headers.host}/`);
});
router.post('/volume', async (req,res) => {
	await manager.put("v3/volume", req.query.volume);
	res.redirect(`${req.protocol}://${req.headers.host}/`);
});
router.get('/_info', async (req,res) => {
	const info = {
		"system": "lucos_media_seinn",
		"checks": {
			"media-manager": {
				"techDetail": "Can fetch data from media manager",
			}
		},
		"metrics": {},
		"ci": {
			"circle": "gh/lucas42/lucos_media_seinn"
		},
		icon: "/logo.jpg",
		network_only: false,
		title: "Play Music",
		show_on_homepage: true,
	};
	try {
		const pollResp = await manager.get("v3/poll");
		if (!pollResp.ok) throw new Error(`Error from media-manager: ${pollResp.statusText}`);
		await pollResp.json();
		info.checks["media-manager"].ok = true;
	} catch (error) {
		info.checks["media-manager"].ok = false;
		info.checks["media-manager"].debug = error.message;
	}
	res.json(info);
});

router.get('/serviceworker-v3.js', async (req, res) => {
	const baseServiceWorker = await fs.readFile('./src/resources/serviceworker-v3.js', { encoding: 'utf8' });
	res.set('Content-Type', 'text/javascript');
	res.send(`const clientVariables = ${clientVariables};\n${baseServiceWorker}`);
});

export default router;