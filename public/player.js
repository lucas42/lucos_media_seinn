var audioContext = new AudioContext();
var current = null;

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
	stopExisting();
	current = {
		trackURL: trackURL
	};

	// If nothing should be playing, then don't proceed.
	if (!data.isPlaying) {
		return;
	}
	fetch(trackURL.replace("ceol srl", "import/black/ceol srl")).then(function (rawtrack) {
		return rawtrack.arrayBuffer();
	}).then(function (arrayBuffer) {
		return audioContext.decodeAudioData(arrayBuffer);
	}).then(function (buffer) {
		if (trackURL != current.trackURL || current.source) {
			console.log("Another track load has overtaken this one, ignoring");
			return;
		}
		var source = audioContext.createBufferSource();
		source.buffer = buffer;
		source.connect(audioContext.destination);
		source.start(0);
		current.source = source;
		current.start = new Date().getTime();
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

function stopExisting() {
	if (!current) return;
	if (current.source) {
		current.source.stop();
	}
	current = null;
}

poll(null);