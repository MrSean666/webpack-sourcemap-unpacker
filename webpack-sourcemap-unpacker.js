#!/usr/bin/env node

const path = require('path');
const fse = require('fs-extra');
const glob = require('glob');
const SourceMapConsumer = require('source-map').SourceMapConsumer;
const program = require('commander');
const config = require('./package.json');
const dataUriToBuffer = require('data-uri-to-buffer');

program.version(config.version, '-v, --version').
    description('Unpack the sourcemaps generated by Webpack to a project folder').
    usage('[options]').
    option('-i, --input [glob-pattern]',
        'a glob patterns to describe sourcemap files to be unpacked, default to *.map').
    option('-o, --output [folder]', 'set the output folder, default to current folder');

program.action((options) => {
    options.input = options.input || '*.map';
    options.output = options.output || '.';
    let files = glob.sync(options.input);
    if (!files.length) {
        console.warn(`There is no ${options.input} in current directory`);
        return;
    }
    console.info(`output src to ${options.output}`);
    files.forEach(async function(filepath) {
        console.info(`extract sourcemap: ${filepath}`);
        const mapSource = fse.readFileSync(path.resolve(filepath));
        const consumer = await new SourceMapConsumer(mapSource.toString());
        const paths = consumer._absoluteSources;
        const sources = consumer.sourcesContent;
        paths.forEach((p, idx) => {
            const parts = p.match(/webpack:\/\/\/([0-9a-zA-Z_/.\-]+?)(\?\w{4})?$/);
            if (!parts || parts[2]) {
                // ignore special path
                // ignore filename ends with hash
                console.log(`ignore file: ${p}`);
                return;
            }

            const folder = path.resolve(path.join(options.output, path.dirname(parts[1])));
            const filename = path.basename(parts[1]);
            const extname = path.extname(filename);

            let absPath = path.resolve(path.join(folder, filename));
            console.info(`output to file: ${absPath}`);

            let source;
            switch (extname) {
                // plain text files
                case '.glsl':
                    source = evalModule(sources[idx]).exports;
                    break;

                // base64 files
                case '.jpg':
                case '.gif':
                case '.png':
                case '.obj':
                    const exports = evalModule(sources[idx]).exports;
                    try {
                        source = dataUriToBuffer(exports);
                    } catch (e) {
                        console.info(`It's not a binary file: ${absPath}`);
                        source = sources[idx];
                        absPath += '.js';
                    }

                    break;
                default:
                    source = sources[idx];
            }

            fse.ensureDirSync(folder);
            fse.writeFileSync(absPath, source);
        });
    });
});

program.parse(process.argv);

function evalModule(source) {
    return eval(`
        let module = {};
        let __webpack_public_path__ = '';
        ${source}
        module; 
    `);
}
