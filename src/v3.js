const router = require('express').Router();
const fetch = require('node-fetch');

const mediaManager = process.env.MEDIA_MANAGER || "https://ceol.l42.eu/";
const receiverApplicationId = process.env.DEV ? "5D5F55DE" : "34252B55";

router.get('/', async (req, res) => {
	const data = await fetch(mediaManager+"poll/summary").then(resp => resp.json());
	const now = data.tracks.shift();
	res.render("index", {
		clientVariables: JSON.stringify({
			mediaManager,
			receiverApplicationId,
		}),
		now,
		playlist: data.tracks,
		isPlaying: data.isPlaying,
		volumeUp: Math.min(1, data.volume+0.1),
		volumeDown: Math.max(0, data.volume-0.1),
	});
});

router.post('/play', async (req,res) => {
	await fetch(mediaManager+"play", {method: 'POST'});
	res.redirect(`${req.protocol}://${req.headers.host}/v3`);
});
router.post('/pause', async (req,res) => {
	await fetch(mediaManager+"pause", {method: 'POST'});
	res.redirect(`${req.protocol}://${req.headers.host}/v3`);
});
router.post('/next', async (req,res) => {
	await fetch(mediaManager+"next", {method: 'POST'});
	res.redirect(`${req.protocol}://${req.headers.host}/v3`);
});
router.post('/volume', async (req,res) => {
	await fetch(mediaManager+"volume?volume="+req.query.volume, {method: 'POST'});
	res.redirect(`${req.protocol}://${req.headers.host}/v3`);
});

module.exports = router;