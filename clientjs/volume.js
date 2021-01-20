
function getActual() {
	return data.poll.volume;
}
function setActual(actualvolume) {
	updateManager("volume", { volume: _validate(actualvolume) });
}

function setPercieved(val) {
	var percievedvolume = _validate(val);
	var actualvolume = _percieved2actual(percievedvolume);
	setActual(actualvolume);
}
function getPercieved() {
	var actualvolume = _validate(getActual());
	return _actual2percieved(actualvolume);
}
function _validate(val) {
	val = parseFloat(val);
	if (isNaN(val)) throw "volume must be a number";
	if (val < 0) val = 0;
	if (val > 1) val = 1;
	return val;
}
function _actual2percieved(val) {
	return val;
}
function _percieved2actual(val) {
	return val;
}
function increment() {
	setPercieved(getPercieved() + 0.1);
}
function decrement() {
	setPercieved(getPercieved() - 0.1);
}
/** Checks whether the _actual2percieved and _percieved2actual algorithms are symetrical and don't return out of bound values **/
function test() {
	var ii, aa, pp;
	for (ii=0; ii<=1; ii+=0.1) {
		aa = _percieved2actual(ii);
		if (!(aa >= 0 && aa <= 1)) return false;
		pp = _actual2percieved(aa);
		if (ii != pp) return false;
	}
	return true;
}
module.exports = {
	getPercieved: getPercieved,
	setPercieved: setPercieved,
	increment: increment,
	decrement: decrement,
	test: test
};