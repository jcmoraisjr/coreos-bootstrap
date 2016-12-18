'use strict';

const yaml = require('js-yaml');
const mustache = require('mustache');
const utils = require('./utils');
const BootstrapError = utils.BootstrapError;
const isObject = utils.isObject;
const merge = utils.merge;
const ConfigLoader = require('./config-loader').ConfigLoader;

exports.CoreBootstrap = CoreBootstrap;

// saying to mustache to use strings literal, do not escape
mustache.escape = function(str) {
    return str;
}

function CloudConfig() {
    this.ssh_authorized_keys = [];
    this.hostname = '';
    this.coreos = {};
    this.coreos.units = [];
    this.write_files = [];
}

function CoreBootstrap(loader) {
    this.cloudConfig = new CloudConfig();
    this._loader = loader;
    this._params = [];
}

CoreBootstrap.prototype.loadConfig = function(configList, dataList, prop, onReady) {
    this._params = [];
    this._validateConfig(configList, dataList);
    var cloudConfig = this._createCloudConfig(configList);
    var view = this._createView(dataList);
    Object.assign(view, prop || {});
    cloudConfig = this._render(cloudConfig, view);
    this.cloudConfig = cloudConfig;
    const config = this._dumpConfig();
    const missing = this._missingParams(view);
    if (missing.length > 0) {
        throw new BootstrapError('Missing properties: ' + missing);            
    }
    onReady(config);
}

CoreBootstrap.prototype.loadBinding = function(bindingName, prop, onReady) {
    const binding = this._loader.loadBindingSync(bindingName);
    this._validateBinding(binding);
    const configList = binding.config || [];
    const dataList = binding.data || [];
    this.loadConfig(configList, dataList, prop, onReady);
}

CoreBootstrap.prototype.loadMissing = function(bindingName, onReady) {
    const binding = this._loader.loadBindingSync(bindingName);
    this._validateBinding(binding);
    const configList = binding.config || [];
    const dataList = binding.data || [];
    this._validateConfig(configList, dataList);
    var cloudConfig = this._createCloudConfig(configList);
    var view = this._createView(dataList);
    this._render(cloudConfig, view);
    const missing = this._missingParams(view);
    this._loadBindingParams('missing', bindingName, function(paramData) {
        var missingOrder = Object.keys(paramData).filter(function(item) {
            return missing.indexOf(item) !== -1;
        });
        missing.forEach(function(item) {
            if (missingOrder.indexOf(item) === -1) {
                missingOrder.push(item);
            }
        });
        onReady(missingOrder.join(' '));
    });
}

CoreBootstrap.prototype.loadMissingParam = function(bindingName, paramName, onReady) {
    this._loadBindingParams('missing', bindingName, function(paramData) {
        const attrData = paramData[paramName];
        var attrList = '';
        for (var attr in attrData) {
            attrList += attr + '=' + attrData[attr] + '\n';
        }
        onReady(attrList);
    });
}

CoreBootstrap.prototype.loadInstallParams = function(bindingName, onReady) {
    this._loadBindingParams('install', bindingName, function(paramData) {
        var params = '';
        for (var key in paramData) {
            params += key + '=' + paramData[key] + '\n';
        }
        onReady(params);
    });
}

CoreBootstrap.prototype._loadBindingParams = function(paramType, bindingName, onReady) {
    const binding = this._loader.loadBindingSync(bindingName);
    this._validateBinding(binding);
    const defaults = this._loader.loadModelSync()[paramType];
    var paramData = {};
    Object.assign(paramData, defaults, binding[paramType]);
    onReady(paramData);
}

CoreBootstrap.prototype._mustaches = function(tokens) {
    var mustaches = [];
    tokens.forEach(function(token) {
        if ((token[0] !== 'text') && (mustaches.indexOf(token[1]) === -1)) {
            mustaches.push(token[1]);
        }
    });
    return mustaches;
}

CoreBootstrap.prototype._validateBinding = function(binding) {
    if (!binding || (typeof binding !== 'object') || (Object.keys(binding).length === 0)) {
        throw new BootstrapError('Invalid binding');
    }
}

CoreBootstrap.prototype._validateConfig = function(configList, dataList) {
    if (!configList || (configList.length === 0)) {
        throw new BootstrapError('Missing config name(s)');
    }
    if (!dataList || (dataList.length === 0)) {
        throw new BootstrapError('Missing data name(s)');
    }
}

CoreBootstrap.prototype._createCloudConfig = function(configList) {
    var cloudConfig = new CloudConfig();
    configList.forEach(function(configName) {
        // TODO async
        const newConfig = this._loader.loadConfigSync(configName);
        if (Object.keys(newConfig).length === 0) {
            throw new BootstrapError('Invalid config name: ' + configName);
        }
        cloudConfig = merge(cloudConfig, newConfig);
    }, this);
    return cloudConfig;
}

CoreBootstrap.prototype._createView = function(dataList) {
    var view = {};
    dataList.forEach(function(dataName) {
        // TODO async
        const newData = this._loader.loadDataSync(dataName);
        if (Object.keys(newData).length === 0) {
            throw new BootstrapError('Invalid data name: ' + dataName);
        }
        Object.assign(view, newData);
    }, this);
    return view;
}

CoreBootstrap.prototype._render = function(cfg, view) {
    if (Array.isArray(cfg)) {
        for (var i in cfg) {
            cfg[i] = this._render(cfg[i], view);
        }
    } else if (isObject(cfg)) {
        for (var key in cfg) {
            cfg[key] = this._render(cfg[key], view);
        }
    } else if (typeof cfg === 'string') {
        this._mustaches(mustache.parse(cfg)).forEach(function(item) {
            if (this._params.indexOf(item) === -1) {
                this._params.push(item);
            }
        }, this);
        return mustache.render(cfg, view);
    }
    return cfg;
}

CoreBootstrap.prototype._dumpConfig = function() {
    var config = this.cloudConfig;
    // moving `units` to the last element
    var units = config.coreos.units;
    delete config.coreos.units;
    config.coreos.units = units;
    return '#cloud-config\n' + yaml.safeDump(config, {'lineWidth':-1})
}

CoreBootstrap.prototype._missingParams = function(view) {
    return this._params.filter(function(value) {
        return !view.hasOwnProperty(value);
    });
}
