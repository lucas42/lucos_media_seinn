const { v4: uuidv4 } = require('uuid');
const pubsub = require("./pubsub");
const manager = require("./manager");

let uuid = localStorage.getItem('device-uuid');
let name = localStorage.getItem('device-name');

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

module.exports = {getUuid, getName, setName};