/// <reference path="../typings/index.d.ts" />

import File = require('vinyl');
import cheerio = require('cheerio');
import through2 = require('through2');
import es = require('event-stream');
import gutil = require('gulp-util');
import stream = require('stream');
import path = require('path');
import crypto = require('crypto');

const BufferStreams: any = require('bufferstreams');
const PLUGIN_NAME = 'html-extract2';

export interface ExtractStream extends NodeJS.ReadWriteStream {
    reinject: NodeJS.ReadWriteStream
}

export function htmlExtract(opts: any) {

    let selector = opts.selector || 'style';
    let extension = opts.extension || 'css';
    let fileIndex = 0;
    let token = PLUGIN_NAME + Date.now();

    function extract(file: File, dom: string, stream: any) {
        var $ = cheerio.load(dom);
        var els = $(selector);

        [].forEach.call(els, function (el: cheerio.Element, i: number) {
            if (el.children.length <= 0) {
                return ;
            }
            var data = (<any>el.children[0]).data;
            var hash = crypto.createHash('md5')
                            .update(data)
                            .update(String(i))
                            .digest('hex');

            var reinjectTag = "<!-- [" + PLUGIN_NAME + ":key-" + hash + "] -->";
            (<any>el.children[0]).data = reinjectTag;

            var newFile = new File(<any>{
                base: file.base,
                path: file.path + "-" + ((<any>el.attribs).id || el.tagName + "-" + i) + '.' + extension,
                contents: new Buffer(data),
                htmlExtract2ReinjectTag: reinjectTag,
                htmlExtract2ReinjectTo: (<any>file).htmlExtract2FileKey
            });
            (<any>file).htmlExtract2Counter++;

            stream.push(newFile);
        });
        return $.html();
    }

    function reinjectInto(file: File, extractedFiles: File[]) {
        if (file.isStream() || file.isNull()) {
            throw new gutil.PluginError(PLUGIN_NAME, new Error("Not support file stream or NULL"));
        }
        let data = String(file.contents);
        extractedFiles.forEach((extractedFile) => {
            if (extractedFile.isStream() || extractedFile.isNull()) {
                throw new gutil.PluginError(PLUGIN_NAME, new Error("Not support file stream or NULL"));
            }
            data = data.replace((<any>extractedFile).htmlExtract2ReinjectTag, String(extractedFile.contents));
        });
        file.contents = new Buffer(data);
    }

    let stream = <ExtractStream>through2.obj(function (file: File, enc: string, callback: Function) {
        var self = this;

        (<any>file).htmlExtract2FileKey = crypto.createHash('md5')
                                    .update(token)
                                    .update(String(fileIndex++))
                                    .digest('hex');

       (<any>file).htmlExtract2Counter = 0;
        
        if (file.isStream()) {
            file.contents = (<stream.Readable>file.contents).pipe(new BufferStreams((err: Error, buf: Buffer, cb: Function) => {
                if (err) {
                    cb(new gutil.PluginError(PLUGIN_NAME, err));
                }
                cb(null, new Buffer(extract(file, String(buf), self)));
            }));
            this.push(file);
        } else if (file.isBuffer()) {
            let newFile = file.clone();
            let newContents = extract(newFile, String(newFile.contents), self);
            newFile.contents = new Buffer(newContents);
            this.push(newFile);
        }

        return callback();
    });

    let storage: any = {};
    let mainFiles: any = {};

    stream.reinject = through2.obj(function (file: File, enc: string, callback: Function) {
        let mainFileKey: string;
        let mainFile: any;
        let dependenciesFiles: Array<File>;

        if ((<any>file).htmlExtract2ReinjectTo) {
            mainFileKey = (<any>file).htmlExtract2ReinjectTo;

            dependenciesFiles = storage[mainFileKey] = storage[mainFileKey] || [];
            dependenciesFiles.push(file);
            mainFile = mainFiles[mainFileKey];
        } else if ((<any>file).htmlExtract2FileKey) {
            mainFileKey = (<any>file).htmlExtract2FileKey;
            mainFile = file.clone();
            mainFiles[mainFileKey] = mainFile;
            dependenciesFiles = storage[mainFileKey] || [];
        } else {
            this.push(file);
            return callback();
        }
        if (mainFile && mainFile.htmlExtract2Counter == dependenciesFiles.length) {
            reinjectInto(mainFile, dependenciesFiles);
            this.push(mainFile);
        }
        return callback();
    });
    
    return stream;
}