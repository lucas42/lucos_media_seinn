const pubsub = require("./pubsub");	

class LucosTimeElement extends HTMLElement {
	constructor() {
		super();

		const shadow = this.attachShadow({mode: 'open'});
		const timeNode = document.createElement("time");
		timeNode.appendChild(document.createTextNode(''));
		timeNode.id = 'lucos_navbar_time';
		let timeNode_timeout;
		function updateNavBarTime(force) {
			if (timeNode_timeout) clearTimeout(timeNode_timeout);
			function leadingZero(num) {
				num += '';
				if (num.length == 1) return '0'+num;
				if (num.length > 1) return num;
				return '0';
			}
			const date = new Date(getTime(force));
			timeNode.firstChild.nodeValue = leadingZero(date.getHours()) + ':' + leadingZero(date.getMinutes()) + ':' + leadingZero(date.getSeconds());
			timeNode_timeout=setTimeout(updateNavBarTime, 1000-date.getMilliseconds());
		}
		updateNavBarTime();
		timeNode.addEventListener('click', function _timenodecolour() {
			timeNode.classList.add("updating");
			timeNode.style.color = "red";
			updateNavBarTime(true);
		}, false);
		pubsub.listen('offsetupdate', function _timenodecolourend(offset) {
			if (offset.fresh) timeNode.classList.remove("updating");
			timeNode.style.color = "";
		});
		shadow.appendChild(timeNode);
	}
}
customElements.define('lucos-time', LucosTimeElement);

var timeFrame;
pubsub.listen("offsetupdate", function (newoffset) {
	localStorage.setItem("lucos_NTPOffset", newoffset.offset);
});
function getTime(force) {
	function clientTime() {
		return new Date().getTime();
	}
	function fetchOffset() {
		
		// Browsers which don't support window messaging can just use their own time.
		if (typeof window.postMessage == 'undefined') return;
		if (timeFrame) {
			pubsub.send("time_offset", { force: force}, timeFrame.contentWindow);
		} else {
			pubsub.listen("api_ready", function _timeAPIReady(params, source) {
				if (source != timeFrame.contentWindow) return;
				fetchOffset();
			});
			timeFrame = document.createElement("iframe");
			timeFrame.src = "https://am.l42.eu/";
			timeFrame.setAttribute("style", "height: 0; width: 0; display:none;");
			document.body.appendChild(timeFrame);
		}
	}
	var savedOffset = parseInt(localStorage.getItem('lucos_NTPOffset'));
	
	// If the offset isn't saved, then request an update and just use client time.
	if (!savedOffset) {
		fetchOffset();
		return clientTime();
	}
	
	if (force) fetchOffset();
	return clientTime() + savedOffset;
}