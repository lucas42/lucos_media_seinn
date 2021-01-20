
function poll(url, handleDataFunction, additionalParamFunction, cache) {
	if (!url) throw "no URL given to poll";
	if (handleDataFunction && typeof handleDataFunction != 'function') throw "handleDataFunction must be a function";
	if (additionalParamFunction && typeof additionalParamFunction != 'function') throw "additionalParamFunction must be a function";
	function actuallyPoll(hashcode) {
		var params = "?";
		params += "hashcode="+hashcode;
		params += "&_cb="+new Date().getTime();
		if (additionalParamFunction) params += additionalParamFunction();
		var response;
		fetch(url+params).then(function decodePoll(response) {
			return response.clone().json().then(function handlePoll(data) {

				// Create a request object which ignores all the params to cache against
				var request = new Request(url);

				// If there's a hashcode, use the new one and evaluate new data.
				if (data.hashcode) {
					hashcode = data.hashcode;
					if (cache) cache.put(request, response.clone());
					if (handleDataFunction) handleDataFunction(data);
				}
				actuallyPoll(hashcode);
			});
		}).catch(function pollError(error){

			// Wait 5 second before trying again to prevent making things worse
			setTimeout(function pollRetry() {
				actuallyPoll(hashcode);
			}, 5000);
		});
	}
	actuallyPoll(null);
}

module.exports = poll;