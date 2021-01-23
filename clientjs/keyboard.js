const volume = require("./volume");
document.addEventListener('keyup', function (e) {
	e.preventDefault();
	e.stopPropagation();
	switch (e.keyCode) {
		case 32: // space
			document.getElementById("playpause").requestSubmit();
			break;
		case 78: //n
		case 39: //right
			document.getElementById("next").requestSubmit();
			break;
		case 38: //up
			volume.increment();
			break;
		case 40: //down
			volume.decrement();
			break;
	}
}, false);