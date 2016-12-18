#!/usr/bin/env node

'use strict';

const fs = require('fs');
const argparse = require('argparse');
const WebFacade = require('./lib/web-facade').WebFacade;

const argparser = new argparse.ArgumentParser({
    description: 'CoreOS Bootstrap',
});
argparser.addArgument(['-c', '--config'], {
    metavar: 'DIR',
    help: 'Configuration dir.',
    required: true,
});
argparser.addArgument(['-e', '--endpoint'], {
    metavar: 'IP:port',
    help: 'Bootstrap endpoint.',
    defaultValue: '127.0.0.1:8080',
});
argparser.addArgument(['-l', '--listen'], {
    metavar: 'PORT',
    help: 'Listening port.',
    defaultValue: 8080,
});
const args = argparser.parseArgs();

const model = args.config + '/model.yaml';
if (! fs.existsSync(model)) {
    console.log('Missing file: ' + model);
    process.exit(1);
}

// listen SIGINT and SIGTERM when inside a container
process.on('SIGINT', function() {
    console.log('Terminating 2');
    process.exit(0);
});
process.on('SIGTERM', function() {
    console.log('Terminating 15');
    process.exit(0);
});

// No need to show stack trace in the client (at this moment)
process.env.NODE_ENV = 'production';

const webFacade = new WebFacade();
webFacade.config(args.config, args.endpoint);
webFacade.listen(args.listen);
