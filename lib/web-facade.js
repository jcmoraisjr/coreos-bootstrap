'use strict';

const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const BootstrapError = require('./utils').BootstrapError;
const ConfigLoader = require('./config-loader').ConfigLoader;
const CoreBootstrap = require('./core-bootstrap').CoreBootstrap;

exports.WebFacade = WebFacade;

function WebFacade() {
}

WebFacade.prototype.config = function(configdir, bootstrapEndpoint) {
    this.loader = new ConfigLoader(configdir);
    this.bootstrapEndpoint = bootstrapEndpoint;
    const api = express.Router();
    const install = express.Router();
    const sh = express.Router();
    this.app = express();
    this.app.use(bodyParser.json());
    this.app.use('/', install);
    this.app.use('/api', api);
    this.app.use('/sh', sh);
    this.app.use(this._handleError);
    this._configAPI(api);
    this._configInstall(install);
    this._configSh(sh);
}

WebFacade.prototype.listen = function(port) {
    this.app.listen(port);
    console.log('Listening :' + port);
}

WebFacade.prototype._handleResponse = function(res, config) {
    res.status(200);
    res.type('text');
    res.end(config);
}

WebFacade.prototype._handleError = function(err, req, res, next) {
    if (err instanceof BootstrapError) {
        res.status(400);
        res.type('text');
        res.end(err.message);
    } else {
        throw err;
    }
}

WebFacade.prototype._configAPI = function(router) {
    const self = this;
    router.post('/config', function(req, res) {
        const coreBootstrap = new CoreBootstrap(self.loader);
        coreBootstrap.loadConfig(req.body.config, req.body.data, req.body.properties, function(config) {
            self._handleResponse(res, config);
            console.log('source: ' + req.connection.remoteAddress + ' | config: ' + req.body.config + ' | data: ' + req.body.data);
        });
    });
    router.get('/bindings/:binding', function(req, res) {
        const coreBootstrap = new CoreBootstrap(self.loader);
        coreBootstrap.loadBinding(req.params.binding, req.query, function(config) {
            self._handleResponse(res, config);
            console.log('source: ' + req.connection.remoteAddress + ' | binding: ' + req.params.binding);
        });    
    });
}

WebFacade.prototype._configInstall = function(router) {
    const self = this;
    router.get('/', function(req, res) {
        res.type('text');
        const installScript = fs.readFileSync(__dirname + '/resources/install.sh', 'utf8');
        res.end(installScript.replace('{{SVC}}', self.bootstrapEndpoint));
    });
}

WebFacade.prototype._configSh = function(router) {
    const self = this;
    router.get('/bindings', function(req, res) {
        const bindings = self.loader.loadModelSync().bindings;
        self._handleResponse(res, '#bindings#\n' + Object.keys(bindings).join('|'));
    });
    router.get('/bindings/:binding/view', function(req, res) {
        const coreBootstrap = new CoreBootstrap(self.loader);
        coreBootstrap.loadView(req.params.binding, function(view) {
            self._handleResponse(res, '#view#\n' + view);
        });
    });
    router.get('/bindings/:binding/missing', function(req, res) {
        const coreBootstrap = new CoreBootstrap(self.loader);
        coreBootstrap.loadMissing(req.params.binding, function(missing) {
            self._handleResponse(res, '#params-missing#\n' + missing);
        });
    });
    router.get('/bindings/:binding/missing/:param', function(req, res) {
        const coreBootstrap = new CoreBootstrap(self.loader);
        coreBootstrap.loadMissingParam(req.params.binding, req.params.param, function(param) {
            self._handleResponse(res, '#missing#\n' + param);
        });
    });
    router.get('/bindings/:binding/install', function(req, res) {
        const coreBootstrap = new CoreBootstrap(self.loader);
        coreBootstrap.loadInstallParams(req.params.binding, function(params) {
            self._handleResponse(res, '#install-params#\n' + params);
        });
    });
}
