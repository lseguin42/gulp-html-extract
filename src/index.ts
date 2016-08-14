/// <reference path="../typings/index.d.ts" />

import cheerio = require('cheerio');
import through2 = require('through2');
import es = require('event-stream');
import gutil = require('gulp-util');
import File = require('vinyl');
import stream = require('stream');

const BufferStreams: any = require('bufferstreams');
const PLUGIN_NAME = 'html-extract2';

interface ExtractStream extends stream.Stream {
    reinject: stream.Stream
}

function extract(dom: string, selector: string) {
    var $ = cheerio.load(dom);
    $(selector).text();
    return "";
}

export = function (opts) {
    let selector = opts.selector || 'style';

    let extractStream = <ExtractStream>es.map(function (file: File, callback: Function) {
        if (file.isNull()) {
            callback(null, file);
            return;
        }
        if (file.isStream()) {
            file.contents = (<stream.Readable>file.contents).pipe(new BufferStreams(function (err: Error, buf: Buffer, cb: Function) {
                if (err) {
                    cb(new gutil.PluginError(PLUGIN_NAME, err));
                }
                buf = new Buffer(extract(String(buf), selector));
                cb(null, buf);
            }));
            callback(null, file);
            return;
        }
        if (file.isBuffer()) {
            let newFile = file.clone();
            let newContents = extract(String(newFile.contents));
            newFile.contents = new Buffer(newContents);
            callback(null, newFile);
        }
    });

    extractStream.reinject = es.map(function () {

    });
    return extractStream;
}