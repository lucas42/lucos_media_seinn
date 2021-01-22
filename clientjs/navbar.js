const pubsub = require("./pubsub");	
const getTime = require("./time");
require("./page-loaded");		   
var navBarAdded = false;
function addNavBar(title) {
	if (navBarAdded) {
		if (title) document.getElementById('lucos_navbar_title').firstChild.nodeValue = title;
		return;
	}
	
	// Only include the navbar on top level frames
	if (window != window.top) return;
	var navbar = document.createElement('div');
	navbar.id='lucos_navbar';
	
	var homeimg = document.createElement('img');
	homeimg.src = 'https://l42.eu/logo.png';
	homeimg.setAttribute("alt", "lucOS");
	homeimg.id = 'lucos_navbar_logo';
	var homeimglnk = document.createElement("a");
	homeimglnk.setAttribute("href", "https://l42.eu/");
	homeimglnk.appendChild(homeimg);
	navbar.appendChild(homeimglnk);
	
	if (!title) title = document.title.replace(/lucos\s*-*\s*/i, '');
	var titleNode = document.createElement('span');
	titleNode.appendChild(document.createTextNode(title));
	titleNode.id='lucos_navbar_title';
	navbar.appendChild(titleNode);
	
	var timeNode = document.createElement('time');
	timeNode.appendChild(document.createTextNode(''));
	timeNode.id = 'lucos_navbar_time';
	var timeNode_timeout;
	function updateNavBarTime(force) {
		if (timeNode_timeout) clearTimeout(timeNode_timeout);
		function leadingZero(num) {
			num += '';
			if (num.length == 1) return '0'+num;
			if (num.length > 1) return num;
			return '0';
		}
		var date = new Date(getTime(force));
		timeNode.firstChild.nodeValue = leadingZero(date.getHours()) + ':' + leadingZero(date.getMinutes()) + ':' + leadingZero(date.getSeconds());
		timeNode_timeout=setTimeout(updateNavBarTime, 1000-date.getMilliseconds());
	}
	updateNavBarTime();
	timeNode.addEventListener('click', function _timenodecolour() {
		timeNode.classList.add("updating");
		updateNavBarTime(true);
	}, false);
	pubsub.listen('offsetupdate', function _timenodecolourend(offset) {
		if (offset.fresh) timeNode.classList.remove("updating");
	});
	titleNode.appendChild(timeNode);
	
	// Swallow any clicks on the navbar to stop pages handling them
	navbar.addEventListener("click", function _stopnavbarpropagation(event) { event.stopPropagation(); }, false);
	
	document.body.classList.add("lucos_gotnavbar");
	document.body.insertBefore(navbar, document.body.firstChild);
	navBarAdded = true;
	pubsub.send('navbaradded', navbar);
}

pubsub.waitFor('ready', addNavBar);