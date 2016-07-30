var audioContext = new AudioContext();
var currentTrackURL = null;
var currentSource = null;

function poll(hashcode) {
	fetch('https://ceol.l42.eu/poll?hashcode='+hashcode+'&_cb='+new Date().getTime()).then(function (res) {
		return res.json();
	}).catch(function(error){
		console.error(error);

		// Wait 5 second before trying again to prevent making things worse
		setTimeout(function () {
			poll(hashcode);
		}, 5000);
	}).then(function (data) {

		// If there's a hashcode, use the new one and evaluate new data.
		if (data.hashcode) {
			poll(data.hashcode);
			evaluateData(data);

		// Otherwise, assume data hasn't changed
		} else {
			poll(hashcode);
		}
	})
}

function evaluateData(data) {
	var trackURL;
	if (data.now && data.now.url) {
		trackURL = data.now.url;
	} else {
		console.error(data);
		return;
	}
	currentTrackURL = trackURL;
	fetch(trackURL.replace("ceol srl", "import/black/ceol srl")).then(function (rawtrack) {
		return rawtrack.arrayBuffer();
	}).then(function (arrayBuffer) {
		return audioContext.decodeAudioData(arrayBuffer);
	}).then(function (buffer) {
		if (trackURL != currentTrackURL) {
			console.log("Another track load has overtaken this one, ignorning");
			return;
		}
		if (currentSource) {
			currentSource.stop();
			currentSource = null;
		}
		var source = audioContext.createBufferSource();
		source.buffer = buffer;
		source.connect(audioContext.destination);
		source.start(0);
		currentSource = source;
	}).catch(function (error) {
		console.error("failed to play track", error);

		// Tell server couldn't play
		var data = new FormData();
		fetch("https://ceol.l42.eu/done?track="+encodeURIComponent(trackURL)+"&status="+encodeURIComponent(error.message), {
		    method: "POST"
		}).then(function (){
			console.log("Given up, skipped track");
		}).catch(function (error) {
			console.error("Can't tell server about track failure", error);
		});
	});
}

poll(null);