var audioContext = new AudioContext();
fetch('https://ceol.l42.eu/poll').then(function (res) {
	return res.json();
}).then(function (data) {
	console.log(data);
	var trackurl = data.now.url.replace("ceol srl", "import/black/ceol srl");
	return fetch(trackurl).catch(function () {
		console.error('failed to get track');
	});
}).then(function (rawtrack) {
	return rawtrack.arrayBuffer();
}).then(function (arrayBuffer) {
	return audioContext.decodeAudioData(arrayBuffer);
}).then(function (buffer) {
	var source = audioContext.createBufferSource();
	source.buffer = buffer;
	source.connect(audioContext.destination);
	source.start(0);
}).catch(function (error) {
	console.error(error);
})