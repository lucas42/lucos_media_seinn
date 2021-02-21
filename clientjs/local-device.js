const { v4: uuidv4 } = require('uuid');

let uuid = localStorage.getItem('device-uuid');
let name = localStorage.getItem('device-name');
let current;

if (!uuid) {
	uuid = uuidv4();
	localStorage.setItem('device-uuid', uuid);
}

function getUuid() {
	return uuid;
}
function getName() {
	return name;
}
function setName(newName) {
	name = newName;
	localStorage.setItem('device-name', name);
}
function isCurrent() {
	return current;
}
function setCurrent(newIsCurrent) {
	current = newIsCurrent;
}

module.exports = {getUuid, getName, setName, isCurrent, setCurrent};