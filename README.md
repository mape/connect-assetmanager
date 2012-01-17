# connect-assetmanager

Middleware for Connect (node.js) for handling your static assets.

<img src="http://mape.me/assetmanager.png" alt="">

## Installation

Via [npm](http://github.com/isaacs/npm):

    $ npm install connect-assetmanager

## Handy pre/post hooks

Make sure to check out [connect-assetmanager-handlers](http://github.com/mape/connect-assetmanager-handlers) for useful hooks you can use (inline base64 for image, vendor prefix fixes for example)

## What does it allow you to do?
* Merge and minify CSS/javascript files
* Auto regenerates the cache on file change so no need for restart of server or manual action.
* Run pre/post manipulation on the files
  * __Use regex to match user agent so you can serve different modified versions of your packed assets based on the requesting browser.__
* Supplies a reference to the modified dates for all groups through assetManager().cacheTimestamps[groupName] as well as md5 hashes assetManager().cacheHashes[groupName] which can be used for cache invalidation in templates.
* Wildcard add files from dir

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

If you want to add all files from the path supplied add '*'. It will insert the files at the position of the *.
You can also use a regexp to match files or use external urls.

    files: ['http://code.jquery.com/jquery-latest.js', /jquery.*/ , '*', 'page.js']

### route (regex as string) - required
The route that will be matched by Connect.

    route: '/\/assets\/css\/.*\.css'

### dataType (string), ['javascript', 'css']
The type of data you are trying to optimize, 'javascript' and 'css' is built into the core of the assetManager and will minify them using the appropriate code.

    dataType: 'css'

### preManipulate (array containing functions)
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

### postManipulate (array containing functions)
Same as preManipulate but runs after the files are merged and minified.

The functions supplied look like this:

    function (file, path, index, isLast, callback) {
        if (path.match(/filename\.js/)) {
            callback(null, file.replace(/string/mig, 'replaceWithThis'));
        } else {
            callback(null, file);
        }
    }
### serveModify (req, res, response, callback)
Allows you do to modify the cached response on a per request basis.

    function(req, res, response, callback) {
        if (externalVariable) {
            // Return empty asset
            response.length = 1;
            response.contentBuffer = new Buffer(' ');
        }
        callback(response);
    }
### stale (boolean)
Incase you want to use the asset manager with optimal performance you can set stale to true.

This means that there are no checks for file changes and the cache will therefore not be regenerated. Recommended for deployed code.

### debug (boolean)
When debug is set to true the files will not be minified, but they will be grouped into one file and modified.

## Example usage
    var sys = require('sys');
    var fs = require('fs');
    var Connect = require('connect');
    var assetManager = require('connect-assetmanager');
    var assetHandler = require('connect-assetmanager-handlers');
    
    var root = __dirname + '/public';
    
    
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
                    assetHandler.yuiCssOptimize
                    , assetHandler.fixVendorPrefixes
                    , assetHandler.fixGradients
                    , assetHandler.stripDataUrlsPrefix
                ],
                // Matches all (regex start line)
                '^': [
                    assetHandler.yuiCssOptimize
                    , assetHandler.fixVendorPrefixes
                    , assetHandler.fixGradients
                    , assetHandler.replaceImageRefToBase64(root)
                ]
            }
        }
    };

    var assetsManagerMiddleware = assetManager(assetManagerGroups);
    Server.use('/'
        , assetsManagerMiddleware
        , Connect.static(root)
    );
