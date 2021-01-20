const volume = require("./volume");
document.addEventListener('keyup', function (e) {
	e.preventDefault();
	e.stopPropagation();
	switch (e.keyCode) {
		case 32: // space
			document.getElementById("playpause").submit();
			break;
		case 78: //n
		case 39: //right
			document.getElementById("next").submit();
			break;
		case 38: //up
			volume.increment();
			break;
		case 40: //down
			volume.decrement();
			break;
	}
}, false);