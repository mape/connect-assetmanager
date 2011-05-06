var child_process = require('child_process');

module.exports.gzip = function(buffer, callback){
	var gzip = child_process.spawn('gzip', ['-9'])
		, buffers = []
		, stdErr = false;
	
	gzip.stdout.on('data', function(chunk){
		buffers.push(chunk);
	});
	
	gzip.stderr.on('data', function(){
		stdErr = true;
		buffers.length = 0;
	});
	
	gzip.on('exit', function(){
		var length = 0
			, index = 0
			, content;
			
		if (buffers.length && !stdErr ){
			buffers.forEach(function(buff){
				length += buff.length;
			});
			
			content = new Buffer(length);
			buffers.forEach(function(buff, i){
				buff.copy(content, index);
				index += buff.length;
			});
			
			buffers.length = 0;
			return callback(null, content);
		}
		return callback(stdErr);
	});
	
	gzip.stdin.write(buffer);
	gzip.stdin.end();
}