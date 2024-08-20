import express from 'express';
const router = express.Router();

const mediaManager = process.env.MEDIA_MANAGER || "https://ceol.l42.eu/";

router.get('/', async (req, res) => {
	const data = await fetch(mediaManager+"poll/summary").then(resp => resp.json());
	const now = data.tracks.shift();
	res.render("index", {
		clientVariables: JSON.stringify({
			mediaManager,
		}),
		now,
		playlist: data.tracks,
		isPlaying: data.isPlaying,
		volumeUp: Math.min(1, data.volume+0.1),
		volumeDown: Math.max(0, data.volume-0.1),
	});
});

router.post('/play', async (req,res) => {
	await fetch(mediaManager+"v3/is-playing", {method: 'PUT', body: "true"});
	res.redirect(`${req.protocol}://${req.headers.host}/`);
});
router.post('/pause', async (req,res) => {
	await fetch(mediaManager+"v3/is-playing", {method: 'PUT', body: "false"});
	res.redirect(`${req.protocol}://${req.headers.host}/`);
});
router.post('/next', async (req,res) => {
	await fetch(mediaManager+"next", {method: 'POST'});
	res.redirect(`${req.protocol}://${req.headers.host}/v3`);
});
router.post('/volume', async (req,res) => {
	await fetch(mediaManager+"volume?volume="+req.query.volume, {method: 'POST'});
	res.redirect(`${req.protocol}://${req.headers.host}/v3`);
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
		const pollResp = await fetch(mediaManager+"poll/summary");
		if (!pollResp.ok) throw new Error(`Error from media-manager: ${pollResp.statusText}`);
		await pollResp.json();
		info.checks["media-manager"].ok = true;
	} catch (error) {
		info.checks["media-manager"].ok = false;
		info.checks["media-manager"].debug = error.message;
	}
	res.json(info);
});

export default router;