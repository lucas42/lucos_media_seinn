const pubsub = require("./pubsub");	
const getTime = require("./time");
require("./page-loaded");		   
var navBarAdded = false;
var navBarMenus = {};
var navBarMenuButtons = {};
function addNavBar(title) {
	if (navBarAdded) {
		if (title) document.getElementById('lucos_navbar_title').firstChild.nodeValue = title;
		return;
	}
	
	// Only include the navbar on top level frames
	if (window != window.top) return;
	var navbar = document.createElement('div');
	navbar.id='lucos_navbar';
	navbar.setAttribute("style", "height: 30px; z-index:1000; color: white; position: absolute; left: 0; right: 0; top: 0; font-size: 18px; background-color: black; background-image: -webkit-gradient(linear, 0 100%, 0 0, color-stop(0, transparent), color-stop(0.15, transparent), color-stop(0.9, rgba(255, 255, 255, 0.4))); font-family: Georgia, serif");
	
	var homeimg = document.createElement('img');
	homeimg.src = 'https://l42.eu/logo.png';
	homeimg.setAttribute("alt", "lucOS");
	homeimg.setAttribute("style", "float: left; height: 25px; padding: 2.5px 2%; cursor: pointer; max-width: 20%; border: none;");
	var homeimglnk = document.createElement("a");
	//homeimglnk.setAttribute("target", "_blank");
	homeimglnk.setAttribute("href", "https://l42.eu/");
	homeimglnk.appendChild(homeimg);
	/*homeimglnk.addEventListener("click", function (event) { 
		if (event.button !== 0) return;
		parent.postMessage(JSON.stringify({type: 'home' }), '*');
		event.preventDefault();
	}, false);*/
	navbar.appendChild(homeimglnk);
	
	if (!title) title = document.title.replace(/lucos\s*-*\s*/i, '');
	var titleNode = document.createElement('span');
	titleNode.appendChild(document.createTextNode(title));
	titleNode.setAttribute("style", "text-align: center; display: block; line-height: 30px; font-weight: bold; position: absolute; width: 50%; margin: 0 25%; z-index: -1; overflow: hidden; height: 30px; text-overflow: ellipsis; white-space: nowrap;");
	titleNode.id='lucos_navbar_title';
	navbar.appendChild(titleNode);
	
	var timeNode = document.createElement('time');
	timeNode.appendChild(document.createTextNode(''));
	timeNode.setAttribute("style", "font-family: \"Courier New\", Courier, monospace; margin: 0 1em;");
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
	timeNode.addEventListener('click', function _timenodecolour() { timeNode.style.color='red'; updateNavBarTime(true); }, false);
	pubsub.listen('offsetupdate', function _timenodecolourend(offset) { if (offset.fresh) timeNode.style.color=''; });
	titleNode.appendChild(timeNode);
	
	
	function createButton(name, img, hide, callback) {
		
		var menuButton = document.createElement('span');
		if (img) {
			var imgNode = document.createElement("img");
			imgNode.src = img;
			imgNode.setAttribute("alt", name);
			imgNode.setAttribute("title", name);
			imgNode.setAttribute('style', "height: 20px; margin: 5px;");
			menuButton.appendChild(imgNode);
		} else {
			menuButton.appendChild(document.createTextNode(name));
		}		
		menuButton.setAttribute("style", "float: right; line-height: 30px; padding: 0 2%; cursor: pointer; font-weight: bold;");
		if (hide) menuButton.style.display = 'none';
		menuButton.setAttribute("class", "lucos_navbar_menubutton");
		navBarMenuButtons[name] = menuButton;
		if (callback) menuButton.addEventListener("click", callback, false);
		navbar.appendChild(menuButton);
		return menuButton;
	}
	
	function createMenu(name, img) {
		if (navBarMenus.hasOwnProperty(name)) return false;
		var menuNode = document.createElement('ul');
		menuNode.setAttribute("style", "position: absolute; top: 30px; border: ridge thick black; list-style-type: none; background: white; right: 80px; max-width: 95%; min-width: 100px; font-size: 15px;");
		menuNode.setAttribute('class', 'lucos_menu');	
		menuNode.style.display = 'none';
		createButton(name, img, true, function (event) {
			if (event.button !== 0) return;
			menuNode.style.display = (menuNode.style.display == 'none') ? 'block' : 'none';
		});
		window.addEventListener("click", function (event) {
			menuNode.style.display = 'none';
		}, true);
		navBarMenus[name] = menuNode;
		document.body.appendChild(menuNode);
		return true;
	}
	/*createButton('music', 'http://l42.eu/music.png', false, function (event) {
		if (event.button !== 0) return;
		pubsub.send('showmusic', null, top);
	});
	window.addEventListener("click", function _hidemusic(event) {
		pubsub.send('hidemusic', null, top);
	}, true);*/
	createMenu('options', 'https://l42.eu/cog.png');
/*	(function _controlDevButton() {
		var devmodebutton = createButton('Dev', null, !detect.isDev(), function () { window.location.reload() });
		devmodebutton.style.color = '#9CF';
		devmodebutton.style.fontFamily = "sans-serif";
		devmodebutton.style.textDecoration = "underline overline";
		devmodebutton.style.webkitTransitionProperty = 'background-color';
		//devmodebutton.style.webkitTransitionDuration = '0';
		pubsub.listen('devmodechange', function _devmodechangetoggledevbutton() {
			devmodebutton.style.webkitTransitionDuration = '0';
			devmodebutton.style.backgroundColor = '#9CF';
			devmodebutton.style.webkitTransitionDuration = '2s';
			devmodebutton.style.display = (detect.isDev()) ? 'block' : 'none';
			// Not quite sure why this timeout is required :S
			window.setTimeout(function () { devmodebutton.style.backgroundColor = 'transparent'; }, 0);
		}, true);
	})();*/
	
	// Swallow any clicks on the navbar to stop pages handling them
	navbar.addEventListener("click", function _stopnavbarpropagation(event) { event.stopPropagation(); }, false);
	
	document.body.style.paddingTop = '30px';
	document.body.classList.add("lucos_gotnavbar");
	document.body.insertBefore(navbar, document.body.firstChild);
	navBarAdded = true;
	pubsub.send('navbaradded', navbar);
	
	// Check whether the user is loggedin
	// Wrap in a try/catch incase the browser doesn't support CORS
	try {
		net.get('https://auth.l42.eu/whoami', null, function (req) {
			var data = JSON.parse(req.responseText);
			if (data.agentid) createButton('Logged in');
		}, null, true);
	} catch (err) {
	}
}

pubsub.waitFor('ready', function _ready() {
	addNavBar();
});