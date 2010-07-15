# connect-assetmanager

Middleware for Connect (node.js) for handling your static assets.

<img src="http://mape.me/assetmanager.png" alt="">

## Installation

Via [npm](http://github.com/isaacs/npm):

    $ npm install connect-assetmanager

## What does it allow you to do?
* Merge and minify CSS/javascript files
* Auto regenerates the cache on file change so no need for restart of server or manual action.
* Run pre/post manipulation on the files
  * __Use regex to match user agent so you can serve different modified versions of your packed assets based on the requesting browser.__
* Supplies a reference to the modified dates for all groups through assetManager(groups).cacheTimestamps which can be used for cache invalidation in templates.

### Nifty things you can do with the pre/post manipulation
* __Replace all url(references to images) with inline base64 data which remove all would be image HTTP requests.__
* Strip all IE specific code for all other browsers.
* Fix all the vendor prefixes (-ms -moz -webkit -o) for things like border-radius instead of having to type all each and every time.


## Speed test (it does just fine)
### Running with
    > connect app -n 4

### Common data
    Concurrency Level:      240
    Complete requests:      10000
    Failed requests:        0
    Write errors:           0

### Small (reset.css)
    Document Path:          /static/test/small
    Document Length:        170 bytes
    
    Time taken for tests:   0.588 seconds
    Total transferred:      4380001 bytes
    HTML transferred:       1700000 bytes
    Requests per second:    17005.50 [#/sec] (mean)
    Time per request:       14.113 [ms] (mean)
    Time per request:       0.059 [ms] (mean, across all concurrent requests)
    Transfer rate:          7273.84 [Kbytes/sec] received

### Larger (jQuery.js)
    Document Path:          /static/test/large
    Document Length:        100732 bytes
    
    Time taken for tests:   10.817 seconds
    Total transferred:      1012772490 bytes
    HTML transferred:       1009913368 bytes
    Requests per second:    924.51 [#/sec] (mean)
    Time per request:       259.597 [ms] (mean)
    Time per request:       1.082 [ms] (mean, across all concurrent requests)
    Transfer rate:          91437.43 [Kbytes/sec] received

## Options
### path (string) - required
The path to the folder containing the files.

    path: __dirname + '/'

### files (array) - required
An array of strings containing the filenames of all files in the group.

    files: ['lib.js', 'page.js']

### route (regex as string) - required
The route that will be matched by Connect.

    route: '/\/assets\/css\/.*\.css'

### dataType (string), ['javascript', 'css']
The type of data you are trying to optimize, 'javascript' and 'css' is built into the core of the assetManager and will minify them using the appropriate code.

    dataType: 'css'

### preManipulate (object containing functions)
There are hooks in the assetManager that allow you to programmaticly alter the source of the files you are grouping.
This can be handy for being able to use custom CSS types in the assetManager or fixing stuff like vendor prefixes in a general fashion.

    'preManipulate': {
        // Regexp to match user-agents including MSIE.
        'MSIE': [
            generalManipulation
            , msieSpecificManipulation
        ],
        // Matches all (regex start line)
        '^': [
            generalManipulation
            , fixVendorPrefixes
            , fixGradients
            , replaceImageRefToBase64
        ]
    }

### postManipulate (object containing functions)
Same as preManipulate but runs after the files are merged and minified.

### stale (boolean)
Incase you want to use the asset manager with optimal performance you can set stale to true.

This means that there are no checks for file changes and the cache will therefore not be regenerated. Recommended for deployed code.

### debug (boolean)
When debug is set to true the files will not be minified, but they will be grouped into one file and modified.

## Example usage
    var sys = require('sys');
    var fs = require('fs');
    var Connect = require('connect');
    var assetManager = require('./connect-assetmanager/lib/assetmanager');
    var base64_encode = require('node-base64/base64').encode;
    
    var root = __dirname + '/public';
    
    // Fix the vendor prefixes
    var fixVendorPrefixes = function (fileContent, path, index, lastFile, callback) {
        // -vendor-border-radius: 5px;
        callback(fileContent.replace(/-vendor-([^:]+): *([^;]+)/g, '$1: $2; -moz-$1: $2; -webkit-$1: $2; -o-$1: $2; -ms-$1: $2;'));
    };
    
    // Dumb fix for simple top down gradients.
    var fixGradients = function (fileContent, path, index, lastFile, callback) {
        // gradient: rgba(0,0,0,0.5)_#000;
        callback(fileContent.replace(/gradient: *([^_]+)_([^;]+)/g, 'background: -webkit-gradient(linear, 0% 0%, 0% 100%, from($1), to($2));background: -moz-linear-gradient(top, $1, $2);'));
    };
    
    // Replace all custom data-url with standard url since MSIE can't handle base64.
    var dummyReplaceImageRefToBase64 = function (fileContent, path, index, lastFile, callback) {
        // background-image: data-url(/img/button.png);
        callback(fileContent.replace(/data-url/ig,'url'));
    };
    
    // Replace all image references with base64 to reduce base64
    var replaceImageRefToBase64 = function (fileContent, path, index, lastFile, callback) {
        // background-image: data-url(/img/button.png);
        var files = fileContent.match(/data-url\(([^)]+)\)/g);
        if (!files) {
            callback(fileContent);
            return;
        }
        fileContent = fileContent.replace(/data-url/g,'url');
        var callIndex = -1;
    
        var handleFiles = function(content, recursion) {
            if (callIndex < files.length-1) {
                callIndex++;
                var filePath = files[callIndex].replace(/(data-url\(|\))/g,'');
                fs.readFile(root+filePath, function (err, data) {
                    if (err) {
                        throw err;
                    }
                    var fileData = data;
                    fs.stat(root+filePath, function(err, data)
                    {
                        if (err) {
                            throw err;
                        }
                        // Internet Explorer 8 limits data URIs to a maximum length of 32 KB
                        if (data.size < 32768) {
                            content = content.replace(new RegExp(filePath), 'data:image/png;base64,'+base64_encode(fileData));
                        }
                        handleFiles(content, path, index, lastFile, handleFiles);
                    });
                });
            } else {
                callback(content);
            }
        };
        handleFiles(fileContent, handleFiles);
    };
    
    var Server = module.exports = Connect.createServer();
    
    Server.use('/',
        Connect.responseTime()
        , Connect.logger()
    );
    
    var assetManagerGroups = {
        'js': {
            'route': /\/static\/js\/[0-9]+\/.*\.js/
            , 'path': './public/js/'
            , 'dataType': 'javascript'
            , 'files': [
                'jquery.js'
                , 'jquery.client.js'
            ]
        }, 'css': {
            'route': /\/static\/css\/[0-9]+\/.*\.css/
            , 'path': './public/css/'
            , 'dataType': 'css'
            , 'files': [
                'reset.css'
                , 'style.css'
            ]
            , 'preManipulate': {
                // Regexp to match user-agents including MSIE.
                'MSIE': [
                    fixVendorPrefixes
                    , dummyReplaceImageRefToBase64
                ],
                // Matches all (regex start line)
                '^': [
                    fixVendorPrefixes
                    , fixGradients
                    , replaceImageRefToBase64
                ]
            }
        }
    };

    var assetsManagerMiddleware = assetManager(assetManagerGroups);
    Server.use('/'
        , Connect.conditionalGet()
        , Connect.cache()
        , Connect.gzip()
        , assetsManagerMiddleware
        , Connect.staticProvider(root)
    );
