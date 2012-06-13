var fs = require('fs')
	, Buffer = require('buffer').Buffer
	, request = require('request')
	, Step = require('step')
	, jsmin = require('./../deps/jsmin').minify
	, htmlmin = require('./../deps/htmlmin').minify
	, cssmin = require('./../deps/cssmin').minify
	, crypto = require('crypto');

var zlib;
try {
	zlib = require('zlib');
} catch(e) {}

var cache = {}
	, settings = {}
	, cacheHashes = {}
	, cacheTimestamps = {};

module.exports = function assetManager (assets) {
	var self = this;

	settings = assets || settings;
	if (!settings) {
		throw new Exception('No asset groups found');
	}

	if (!settings.forEach) {
		settings.forEach = function(callback) {
			Object.keys(this).forEach(function(key) {
				if (key !== 'forEach') {
					callback(settings[key], key);
				}
			});
		};
	}

	Step(function() {
		var grouping = this.group();
		settings.forEach(function(group, groupName) {
			var patterns = []
			, insertions = []
			, matchInsertionCount = {};

			group.files.forEach(function(fileName, index) {
				var pattern = null;
				if (fileName.exec) { // Got a RegEx
					pattern = fileName;
				} else if (fileName.trim() === '*') {
					pattern = /\.[a-z]+$/i; // Anything with a extension
				}

				if (pattern) {
					patterns.push({
						pattern: pattern,
						index: index
					});
					matchInsertionCount['insert-'+index] = 0;
				}
			});

			var fileFetchCallback = grouping();
			fs.readdir(group.path, function(err, files) {
				if (err) {
					throw err;
				}
				files.forEach(function(fileName, index) {
					var alreadyIncluded = false,
						matchedPattern = false;

					group.files.forEach(function(includedFile) {
						if (alreadyIncluded || includedFile.trim && (includedFile.trim() === fileName.trim())) {
							alreadyIncluded = true;
						}
					});

					if (!alreadyIncluded) {
						patterns.forEach(function(pattern) {
							if (!matchedPattern && pattern.pattern.exec(fileName)) {
								matchedPattern = pattern;
							}
						});
					}
					if (matchedPattern) {
						insertions.push({
							file: fileName,
							index: matchedPattern.index
						});
					}
				});
				insertions.forEach(function(insertion, index) {
					if (!matchInsertionCount['insert-'+insertion.index]) {
						group.files.splice(insertion.index, 1, insertion.file);
					} else {
						group.files.splice(insertion.index+matchInsertionCount['insert-'+insertion.index], 0, insertion.file);
					}
					matchInsertionCount['insert-'+insertion.index] += 1;
				});
				fileFetchCallback(null, true);
			});
		});
	}, function(err, contents) {
		settings.forEach(function (group, groupName) {
			if (!group.stale) {
				group.files.forEach(function (file, index) {
					if (!file.match) {
						console.log('No match for: '+file);
						group.files.splice(index, 1);
						return;
					}
					if (file.match(/^https?:\/\//)) {
						return;
					}
					fs.watch(group.path + file, function (event, file) {
						if (event === 'change') {
							self.generateCache(groupName);
						}
					});
				});
			}
		});
		self.generateCache();
	});

	this.generateCache = function (generateGroup) {
		var self = this;
		settings.forEach(function (group, groupName) {
			var userAgentMatches = {};
			if (group.preManipulate) {
				Object.keys(group.preManipulate).forEach(function(key) {
					userAgentMatches[key] = true;
				});
			}
			if (group.postManipulate) {
				Object.keys(group.postManipulate).forEach(function(key) {
					userAgentMatches[key] = true;
				});
			}
			if (!Object.keys(userAgentMatches).length) {
				userAgentMatches = ['^'];
			} else {
				userAgentMatches = Object.keys(userAgentMatches);
			}

			userAgentMatches.forEach(function(match) {
				var path = group.path;
				Step(function () {
					var grouping = this.group();
					group.files.forEach(function (file) {
						if (!generateGroup || generateGroup && groupName === generateGroup) {
							self.getFile(file, path, groupName, grouping());
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
						if (typeof file == "string"){
							continue;
						}
						if (typeof file.modified != "undefined"){
							file.modified = new Date();
						}
						if (Object.prototype.toString.call(file.modified) === "[object Date]" && !isNaN(file.modified)){
							
						} else {
							file.modified = new Date();
						}
						if (!lastModified || lastModified.getTime() < file.modified.getTime()) {
							lastModified = file.modified;
						}
						if (!group.preManipulate) {
							group.preManipulate = {};
						}

						self.manipulate(group.preManipulate[match], file.content, file.filePath, i, i === l - 1, grouping());
					};
					if (!lastModified && !contents.length) {
						grouping();
						return;
					}
					cacheTimestamps[groupName] = lastModified.getTime();
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
					var dataTypeLowerCase = group.dataType.toLowerCase();
					if (!group.debug) {
						if (dataTypeLowerCase === 'javascript' || dataTypeLowerCase === 'js') {
							(function (callback){callback(null, jsmin(content));})(grouping());
						} else if (dataTypeLowerCase === 'html') {
							(function (callback){callback(null, htmlmin(content));})(grouping());
						} else if (dataTypeLowerCase === 'css') {
							(function (callback){callback(null, cssmin(content));})(grouping());
						}
					} else {
						grouping()(null, content);
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

					cacheHashes[groupName] = crypto.createHash('md5').update(content).digest('hex');

					cache[groupName][match].encodings = {};
					var encodings = cache[groupName][match].encodings;

					var utf8Buffer = new Buffer(content, 'utf8');
					encodings.utf8 = {
						'buffer': utf8Buffer,
						'length': utf8Buffer.length,
						'encoding': false
					};

					if(zlib) {
						var gzipBuffer = zlib.gzip(utf8Buffer, function(error, result) {
							encodings.gzip = {
								'buffer': result,
								'length': result.length,
								'encoding': 'gzip'
							};
						});
					} 
				});
			});
		});
	};

	this.manipulate = function (manipulateInstructions, fileContent, path, index, last, callback) {
		if (manipulateInstructions && Array.isArray(manipulateInstructions)) {
				var callIndex = 0;
				(function modify(content, path, index, last) {
					if (callIndex < manipulateInstructions.length) {
						callIndex++;
						manipulateInstructions[callIndex-1](content, path, index, last, function (content) {
							modify(content, path, index, last);
						});
					} else {
						callback(null, content);
					}
				})(fileContent, path, index, last);
		} else if (manipulateInstructions && typeof manipulateInstructions === 'function') {
			manipulateInstructions(fileContent, path, index, last, callback);
		} else {
			callback(null, fileContent);
		}
	};

	this.getFile = function (file, path, groupName, callback) {
		var isExternal = false;
		if (file && file.match(/^https?:\/\//)) {
			isExternal = true;
		}

		var fileInfo = {
			'filePath': isExternal ? file: path+file
		};

		if (isExternal) {
			request({uri: file}, function(err, res, body) {
				fileInfo.content = body;
				fileInfo.external = true;
				if (typeof res != "undefined" && res != null){
					fileInfo.modified = new Date(res.headers['last-modified']);
				}
				callback(null, fileInfo);
			});
		} else {
			setTimeout(function() {
				fs.readFile(path+file, function (err, data) {
					if (err) {
						console.log('Could not find: '+file);
						callback(null, '');
						return;
					}
					fileInfo.content = data.toString();

					fs.stat(path+file, function (err, stat) {
						fileInfo.modified = stat.mtime;
						callback(null, fileInfo);
					});
				});
			}, 100);
		}
	};

	this.acceptsGzip = function(req) {
		var accept = req.headers["accept-encoding"];
		return accept && accept.toLowerCase().indexOf('gzip') !== -1;
	}

	function assetManager (req, res, next) {
		var self = this;
		var found = false;
		var response = {};
		var mimeType = 'text/plain';
		var groupServed;
		settings.forEach(function (group, groupName) {
			if (group.route.test(req.url)) {
				var userAgent = req.headers['user-agent'] || '';
				groupServed = group;
				if (group.dataType === 'javascript') {
					mimeType = 'application/javascript';
				}
				else if (group.dataType === 'html') {
					mimeType = 'text/html';
				}
				else if (group.dataType === 'css') {
					mimeType = 'text/css';
				}
				if (cache[groupName]) {
					Object.keys(cache[groupName]).forEach(function(match) {
						if (!found && userAgent.match(new RegExp(match, 'i'))) {
							found = true;
							var item = cache[groupName][match];

							var content = item.encodings.utf8;
							if(zlib && item.encodings.gzip && this.acceptsGzip(req)) {
								content = item.encodings.gzip;
							}
							
							response = {
								contentLength: content.length
								, modified: item.modified
								, contentBuffer: content.buffer
								, encoding: content.encoding
							};
						}
					});
				}
			}
		});
		
		if (!found) {
			next();
		} else {
			if (groupServed.serveModify) {
				groupServed.serveModify(req, res, response, function(response) {
					serveContent(response);
				});
			} else {
				serveContent(response);
			}
			function serveContent(response) {
				var headers = {
					'Last-Modified': response.modified,
					'Date': (new Date).toUTCString(),
					'Cache-Control': 'public,max-age=' + 31536000,
					'Expires': response.expires || (new Date(new Date().getTime()+63113852000)).toUTCString(),
					'Vary': 'Accept-Encoding'
				};

				if (req.headers['if-modified-since'] &&
					Date.parse(req.headers['if-modified-since']) >= Date.parse(response.modified)) {
					res.writeHead(304, headers);
					res.end();
				} else {
					headers['Content-Type'] = mimeType;
					headers['Content-Length'] = response.contentLength;

					if(response.encoding) {
						headers['Content-Encoding'] = response.encoding
					}

					res.writeHead(200, headers);
					res.end(response.contentBuffer);
				}
			}
			return;
		}
	};

	assetManager.cacheTimestamps = cacheTimestamps;
	assetManager.cacheHashes = cacheHashes;

	return assetManager;
};
