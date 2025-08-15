import express from 'express';
import * as manager from '../utils/manager.js';
import fs from 'node:fs/promises';
import { middleware as authMiddleware } from './auth.js';

const router = express.Router();
router.auth = authMiddleware;

const mediaManager = process.env.MEDIA_MANAGER_URL || (() => { throw "MEDIA_MANAGER_URL Environment Variable not set" })();
const apiKey = process.env.KEY_LUCOS_MEDIA_MANAGER || (() => { throw "KEY_LUCOS_MEDIA_MANAGER Environment Variable not set" })();
const mediaPassword = process.env.KEY_LUCOS_PRIVATE || (() => { throw "KEY_LUCOS_PRIVATE Environment Variable not set" })();
const environment = process.env.ENVIRONMENT || (() => { throw "ENVIRONMENT Environment Variable not set" })();
manager.init(mediaManager, apiKey, 'lucos_media_seinn');

// Endpoint that's purely for authentication purposes (which won't be handled by the service worker)
router.get('/login', (req, res) => {
	// Check the redirect query to avoid open redirect vulnerabilities
	if (!req.query.redirect_path?.startsWith("/")) {
		throw new ValidationError("Invalid redirect_path parameter");
	}
	res.redirect(req.query.redirect_path);
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
router.use((req, res, next) => router.auth(req, res, next));
router.get('/', async (req, res) => {
	try {
		const data = await manager.get("v3/poll").then(resp => resp.json());
		const now = data.tracks.shift();
		res.render("index", {
			now,
			playlist: data.tracks,
			isPlaying: data.isPlaying,
			volumeUp: Math.min(1, data.volume+0.1),
			volumeDown: Math.max(0, data.volume-0.1),
		});
	} catch (exception) {
		console.warn("Failed to fetch poll from the server", exception);
		res.render("index", {});
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

router.get('/client-variables.json', async (req, res) => {
	res.json({
		mediaManager,
		apiKey,
		mediaCreds: {
			user: `lucos_media_seinn-${environment}`,
			password: mediaPassword,
		},
	});
});

export default router;