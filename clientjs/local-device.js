const { v4: uuidv4 } = require('uuid');

let uuid;
let name;
let current;

if (typeof localStorage !== 'undefined') {
	uuid = localStorage.getItem('device-uuid');
	name = localStorage.getItem('device-name');

	if (!uuid) {
		uuid = uuidv4();
		localStorage.setItem('device-uuid', uuid);
	}
}

function getUuid() {
	return uuid;
}
function setUuid(newUuid) {
	if (uuid === newUuid) return;
	if (uuid !== undefined) throw "Device uuid already set, can't change";
	uuid = newUuid;
}
function getName() {
	return name;
}
function setName(newName) {
	name = newName;
	if (typeof localStorage !== 'undefined') localStorage.setItem('device-name', name);
}
function isCurrent() {
	return current;
}
function setCurrent(newIsCurrent) {
	current = newIsCurrent;
}

module.exports = {getUuid, setUuid, getName, setName, isCurrent, setCurrent};