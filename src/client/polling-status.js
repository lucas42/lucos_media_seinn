const streamStatus = new BroadcastChannel("stream_status");
streamStatus.addEventListener("message", function streamStatusMessage(event) {
	switch (event.data) {
		case "opened":
			document.getElementsByTagName('lucos-navbar')[0].setAttribute('streaming', 'active');
			break;
		case "closed":
			document.getElementsByTagName('lucos-navbar')[0].setAttribute('streaming', 'stopped');
			break;
	}
});