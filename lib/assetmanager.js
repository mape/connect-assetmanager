var sys = require('sys'),
	fs = require('fs'),
	Buffer = require('buffer').Buffer,
	Step = require('./../deps/step/lib/step'),
	jsmin = require('./../deps/jsmin').minify,
	htmlmin = require('./../deps/htmlmin').minify,
	cssmin = require('./../deps/cssmin').minify;
var cache = {};

module.exports = function assetManager (settings)
{
	var self = this;
	this.cacheTimestamps = {};

	this.generateCache = function (generateGroup) {
		var self = this;
		settings.forEach(function (group, groupName) {
			var userAgentMatches = [];
			if (group.preManipulate)
			{
				Object.keys(group.preManipulate).forEach(function(key) {
					userAgentMatches.push(key);
				});
			}
			if (group.postManipulate)
			{
				Object.keys(group.postManipulate).forEach(function(key) {
					userAgentMatches.push(key);
				});
			}
			if (!userAgentMatches.length)
			{
				userAgentMatches = ['^'];
			}

			userAgentMatches.forEach(function(match) {
				var path = group.path;
				Step(function () {
					var grouping = this.group();
					group.files.forEach(function (file) {
						if (!generateGroup || generateGroup && groupName == generateGroup) {
							self.getFile(path + file, groupName, grouping());
						}
					});
				}, function (err, contents) {
					if (err) {
						throw err;
					}
					var grouping = this.group();
					var lastModified = null;

					for (var i = 0, l = contents.length; i < l; i++) {
						var file = contents[i];
						if (!lastModified || lastModified.getTime() < file.modified.getTime()) {
							lastModified = file.modified;
						}
						if (!group.preManipulate) {
							group.preManipulate = {};
						}

						if (group.dataType.toLowerCase() === 'css') {
							self.manipulate(group.preManipulate[match], file.content.replace(/\n/g,''), file.filePath, i, i === l - 1, grouping());
						} else {
							self.manipulate(group.preManipulate[match], file.content, file.filePath, i, i === l - 1, grouping());
						}
					};
					self.cacheTimestamps[groupName] = lastModified.getTime();
					if (!cache[groupName]) {
						cache[groupName] = {};
					}
					cache[groupName][match] = {
						'modified': lastModified.toUTCString()
					};
				}, function (err, contents) {
					if (err) {
						throw err;
					}
					var grouping = this.group();

					var content = '';
					for (var i=0; i < contents.length; i++) {
						content += contents[i] + "\n";
					};
					if (!group.debug) {
						if (group.dataType.toLowerCase() === 'javascript' || group.dataType.toLowerCase() === 'js') {
							(function (callback){callback(null, jsmin(content));})(grouping());
						} else if (group.dataType.toLowerCase() === 'html') {
							(function (callback){callback(null, htmlmin(content));})(grouping());
						} else if (group.dataType.toLowerCase() === 'css') {
							(function (callback){callback(null, cssmin(content));})(grouping());
						}
					} else {
						(function (callback){callback(null, content);})(grouping());
					}
				}, function (err, contents) {
					if (err) {
						throw err;
					}

					var grouping = this.group();

					var content = '';
					for (var i=0; i < contents.length; i++) {
						content += contents[i];
					};

					if (!group.postManipulate) {
						group.postManipulate = {};
					}
					self.manipulate(group.postManipulate[match], content, null, 0, true, grouping());

				}, function (err, contents) {
					if (err) {
						throw err;
					}

					var content = '';
					for (var i=0; i < contents.length; i++) {
						content += contents[i];
					};

					cache[groupName][match].contentBuffer = new Buffer(content, 'utf8');
					cache[groupName][match].contentLenght = cache[groupName][match].contentBuffer.length;
				});
			});
		});
	};
	this.manipulate = function (manipulateInstructions, fileContent, path, index, last, callback) {
		if (manipulateInstructions && typeof manipulateInstructions == 'object' && manipulateInstructions.length) {
				var callIndex = -1;

				var modify = function (content, path, index, last, modify)
				{
					if (callIndex < manipulateInstructions.length-1) {
						callIndex++;
						manipulateInstructions[callIndex](content, path, index, last, function (content) {
							modify(content, path, index, last, modify);
						});
					} else {
						callback(null, content);
					}
				};
				modify(fileContent, path, index, last, modify);
		} else if (manipulateInstructions && typeof manipulateInstructions == 'function') {
			manipulateInstructions(fileContent, path, index, last, callback);
		} else {
			callback(null, fileContent);
		}
	};
	this.getFile = function (filePath, groupName, callback) {
		setTimeout(function () {
			var fileInfo = {
				'filePath': filePath
			};
			fs.readFile(filePath, function (err, data) {

				if (err) {
					throw err;
				}
				fileInfo.content = data.toString();

				fs.stat(filePath, function (err, stat) {
					fileInfo.modified = stat.mtime;
					callback(null, fileInfo);
				});
			});
		}, 100);
	};

	this.generateCache();

	settings.forEach(function (group, groupName) {
		if (!group.stale) {
			group.files.forEach(function (file) {
				fs.watchFile(group.path + file, function (old, newFile) {
					if (old.mtime.toString() != newFile.mtime.toString()) {
						self.generateCache(groupName);
					}
				});
			});
		}
	});

	function assetManager (req, res, next)
	{
		var self = this;
		var found = false;
		var responce = {};
		var mimeType = 'text/plain';

		settings.forEach(function (group, groupName) {
			if (group.route.test(req.url)) {
				var userAgent = req.headers['user-agent'];

				if (group.dataType == 'javascript') {
					mimeType = 'application/javascript';
				}
				else if (group.dataType == 'html') {
					mimeType = 'text/html';
				}
				else if (group.dataType == 'css') {
					mimeType = 'text/css';
				}
				if (cache[groupName]) {
					Object.keys(cache[groupName]).forEach(function(match) {
						if (!found && userAgent.match(new RegExp(match, 'i'))) {
							found = true;
							responce = {
								contentLenght: cache[groupName][match].contentLenght
								, modified: cache[groupName][match].modified
								, contentBuffer: cache[groupName][match].contentBuffer
							};
						}
					});
				}
			}
		});
		
		if (!found) {
			next();
		} else {
			res.writeHead(200, {
				'Content-Type': mimeType,
				'Content-Length': responce.contentLenght,
				'Last-Modified': responce.modified,
				'Date': (new Date).toUTCString(),
				'Cache-Control': 'public max-age=' + 31536000,
				'Expires': (new Date(new Date().getTime()+63113852000)).toUTCString()
			});
			res.end(responce.contentBuffer);

			return;
		}
	};

	assetManager.cacheTimestamps = this.cacheTimestamps;
	return assetManager;
};