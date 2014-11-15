// through2 is a thin wrapper around node transform streams
var through = require('through2');
var gutil = require('gulp-util');
var PluginError = gutil.PluginError;
var pkg = require('./package.json');
var spritesmith = require('gulp.spritesmith');
var csso = require('gulp-csso');
var imagemin = require('gulp-imagemin');
var fs = require('fs');
var path = require('path');
var mkdirp = require("mkdirp");
var gs = require('glob-stream');
var globule = require('globule');
var jsdom = require("jsdom");
var $ =  require('jquery');
var async = require('async');



function inArray(elem,array)
{
    var len = array.length;
    for(var i = 0 ; i < len;i++)
    {
        if(array[i] === elem){return i;}
    }
    return -1;
}

// exporting the plugin main function
module.exports = function (options) {
    // creating a stream through which each file will pass
    var stream = through.obj(function(file, enc, cb) {
	if (file.isNull()) {
	    return cb(null, file)
	}
	

        var imagePathArray = []
        var imageKeyArray = []
        var imageCSSArray = []

	if (file.isBuffer()) {
            var fileName = path.basename(file.path, '.html')
	    var contents = file.contents.toString()
	    var matched = contents.match(/<\s*img.*src=\"\/static\/images\/.*\/>/g)

	    if (matched) {
		matched.forEach(function (element, index, array) {
                    var pngImage = element.match(/src=\"(.*?png)\"/)
                    if (pngImage && -1 === inArray(options.image_src + pngImage[1], imagePathArray) && fs.existsSync(options.image_src + pngImage[1])) {

                        imagePathArray.push(options.image_src +  pngImage[1])
                        imageKeyArray.push(pngImage[1])
                    }
		})

                if (imagePathArray.length > 1) {

                    imagePathArray.forEach(function (ele, index, arr) {
                        imageCSSArray.push('icon-' + fileName.replace('.', '_') + '-' + path.basename(ele, '.png'))
                    })

                    //motify the file

                    var lines = file.contents.toString().split(/\n|\r|\r\n/)

                    async.map(lines, function (line, callback) {
                        if (line.indexOf('img')) {
                            var thematched = line.match(/<\s*img.*src=\"(\/static\/images\/.*?png)\".*\/>/i)
                            if (thematched && fs.existsSync(options.image_src + thematched[1])) {
                                var imgEle = thematched[0]
                                var imgSrc = thematched[1]
                                var lineParts = line.split(imgEle)
                                var newImgEle = imgEle
                                // first argument can be html string, filename, or url
                                jsdom.env(imgEle, function (errors, window) {
                                    var $img = $(window);
                                    $img('img').attr('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7') //set empty image not remove http://stackoverflow.com/questions/9172895/remove-border-around-sprite-image-in-chrome
                                    var cssIndex = inArray(imgSrc, imageKeyArray)
                                    $img('img').addClass(imageCSSArray[cssIndex])
                                    newImgEle = $img('img')[0].outerHTML
	                            callback(null, lineParts.join(newImgEle))
			
                                })

                            }
                            else {
                                callback(null, line)
                            }
	                } else {
                            callback(null, line)
	                }

                    },function (err, results) {
	                var newContent = results.join('\n')
	                file.contents = new Buffer(newContent)
                        cb(null, file)
                    })

                    // Generate our spritesheet
                    var opts =  {
                        read: true,
                        buffer: true
                    }
                    var glob = globule.find(imagePathArray)
                    var globStream = gs.create(glob, opts);
                    var timestamp = new Date().getTime()
                    var spriteData = globStream.pipe(spritesmith({
                        algorithm:'binary-tree',
                        imgName: options.image_dist + fileName + '-' + timestamp+ '.sprite.png',
                        cssName: options.css_dist + 'sprite.css',
                        cssVarMap: function (sprite) {
                            sprite.name = fileName.replace('.', '_') + '-' + sprite.name
                        }
                    }))


                    mkdirp(options.image_dist, function (err) {

                        if (err) {return err;}
                        spriteData.img
                            .pipe(imagemin())
                            .pipe(through.obj(function (fileStream) {
                                fileStream.pipe(fs.createWriteStream(fileStream.path))
                            }));
                    })
                    mkdirp(options.css_dist, function (err) {
                        if (err) {return err;}
                        spriteData.css
                            .pipe(csso())
                            .pipe(through.obj(function (fileStream) {
                                fileStream.pipe(fs.createWriteStream(fileStream.path, {'flags': 'a'}))
                            }));
                    })
                }
                else {
                    cb(null, file)
                }
	    }
            else {
                cb(null, file)
            }
	}

	if (file.isStream()) {
	    return cb(new PluginError(pkg.name, 'Streaming is not supported'))
	}
    });

    // returning the file stream
    return stream;
};
