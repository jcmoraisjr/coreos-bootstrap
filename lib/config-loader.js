'use strict';

const fs = require('fs');
const yaml = require('js-yaml');
const BootstrapError = require('./utils').BootstrapError;

exports.ConfigLoader = ConfigLoader;

function ConfigLoader(basedir) {
    this.basedir = basedir;
}

ConfigLoader.prototype._loadSync = function(fileName) {
    var fileContent;
    try {
        fileContent = fs.readFileSync(this.basedir + '/' + fileName + '.yaml', 'utf8');
    } catch(e) {
        return {};
    }
    return yaml.safeLoad(fileContent);
}

ConfigLoader.prototype.loadConfigSync = function(configName) {
    return this._loadSync('config-' + configName);
}

ConfigLoader.prototype.loadDataSync = function(dataName) {
    return this._loadSync('data-' + dataName);
}

ConfigLoader.prototype.loadModelSync = function() {
    return this._loadSync('model');
}

ConfigLoader.prototype.loadBindingSync = function(bindingName) {
    const bindings = this.loadModelSync().bindings;
    if (!bindings.hasOwnProperty(bindingName)) {
        throw new BootstrapError('Binding not found: ' + bindingName);
    }
    return bindings[bindingName];
}
