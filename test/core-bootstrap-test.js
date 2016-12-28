'use strict';

const expect = require('chai').expect;
const BootstrapError = require('../lib/utils').BootstrapError;
const CoreBootstrap = require('../lib/core-bootstrap').CoreBootstrap;

function ConfigLoaderMock() {
}

ConfigLoaderMock.prototype.loadConfigSync = function(configName) {
    switch (configName) {
        case 'cfg':
            return {
                "coreos":{}
            };
        case 'core':
            return {
                "coreos":{
                    "update":{
                        "reboot-strategy":"{{reboot_strategy}}"
                    }
                }
            };
        case 'double':
            return {
                "coreos":{
                    "update":{
                        "reboot-strategy":"{{reboot_strategy}}",
                        "group":"{{channel}}"
                    }
                }
            };
        case 'triple':
            return {
                "coreos":{
                    "update":{
                        "reboot-strategy":"{{reboot_strategy}}",
                        "server":"{{update_server}}",
                        "group":"{{channel}}"
                    }
                }
            };
    }
    return {};
}

ConfigLoaderMock.prototype.loadDataSync = function(dataName) {
    switch (dataName) {
        case 'data':
            return {"ipaddr":""};
        case 'data_core':
            return {"reboot_strategy":"etcd-lock"};
    }
    return {};
}

ConfigLoaderMock.prototype.loadModelSync = function() {
    return {
        "missing":{
            "reboot_strategy":{
                "__opt":"echo 'etcd-lock|reboot|off'",
                "_default":"$__opt",
                "_regex_validate":"^(${__opt})$"
            }
        },
        "install":{
            "coreos_channel":"stable"
        },
        "bindings":{
            "simple":{
                "config":["core"],
                "data":["data_core"],
                "install":{
                    "device":"/dev/sda"
                }
            },
            "simple_beta":{
                "config":["core"],
                "data":["data_core"],
                "install":{
                    "coreos_channel":"beta"
                }
            },
            "simple_missing":{
                "config":["core"],
                "data":["data"]
            },
            "simple_missings_two":{
                "config":["double"],
                "data":["data"]
            },
            "simple_missings_three":{
                "config":["triple"],
                "data":["data"]
            },
            "simple_missing_order":{
                "config":["triple"],
                "data":["data"],
                "missing":{
                    "channel":{}
                }
            },
            "double_data":{
                "config":["core"],
                "data":["data","data_core"]
            }
        }
    };
}

ConfigLoaderMock.prototype.loadBindingSync = function(bindingName) {
    return this.loadModelSync().bindings[bindingName];
}

function TestBootstrapError() {}

describe('CoreBootstrap', function() {
    var coreBootstrap;
    beforeEach(function() {
        coreBootstrap = new CoreBootstrap(new ConfigLoaderMock());
    });
    afterEach(function() {
        coreBootstrap = undefined;
    });
    describe('loadConfig', function() {
        it('should throw on udefined configList', function() {
            expect(function() {
                coreBootstrap.loadConfig(undefined, ['data'], {}, function(){});
            }).to.throw(BootstrapError, 'Missing config name(s)');
        });
        it('should throw on udefined dataList', function() {
            expect(function() {
                coreBootstrap.loadConfig(['cfg'], undefined, {}, function(){});
            }).to.throw(BootstrapError, 'Missing data name(s)');
        });
        it('should throw on empty configList', function() {
            expect(function() {
                coreBootstrap.loadConfig([], [], {}, function(){});
            }).to.throw(BootstrapError, 'Missing config name(s)');
        });
        it('should throw on empty dataList', function() {
            expect(function() {
                coreBootstrap.loadConfig(['cfg'], [], {}, function(){});
            }).to.throw(BootstrapError, 'Missing data name(s)');
        });
        it('should call onReady on ready', function(done) {
            coreBootstrap.loadConfig(['cfg'], ['data'], {}, function() {
                done();
            });
        });
        it('should throw on invalid config', function() {
            expect(function() {
                coreBootstrap.loadConfig(['cfgxxx'], ['data'], {}, function(){});
            }).to.throw(BootstrapError, 'Invalid config name: cfgxxx');
        });
        it('should throw on invalid data', function() {
            expect(function() {
                coreBootstrap.loadConfig(['cfg'], ['dataxxx'], {}, function(){});
            }).to.throw(BootstrapError, 'Invalid data name: dataxxx');
        });
        it('should throw on missing data', function() {
            expect(function() {
                coreBootstrap.loadConfig(['core'], ['data'], {}, function(){});
            }).to.throw(BootstrapError, 'Missing properties: reboot_strategy');
        });
        it('should use data attributes', function(done) {
            coreBootstrap.loadConfig(['core'], ['data_core'], {}, function(config) {
                expect(config).to.equals(`#cloud-config
ssh_authorized_keys: []
hostname: ''
coreos:
  update:
    reboot-strategy: etcd-lock
  units: []
write_files: []
`);
                done();
            });
        });
        it('should use custom attributes', function(done) {
            coreBootstrap.loadConfig(['core'], ['data'], {"reboot_strategy":"off"}, function(config) {
                expect(config).to.equals(`#cloud-config
ssh_authorized_keys: []
hostname: ''
coreos:
  update:
    reboot-strategy: 'off'
  units: []
write_files: []
`);
                done();
            });
        });
    });
    describe('loadBinding', function() {
        it('should throw on undefined binding', function() {
            expect(function() {
                coreBootstrap.loadBinding(undefined, {}, function(){});
            }).to.throw(BootstrapError, 'Invalid binding');
        });
        it('should throw on invalid binding', function() {
            expect(function() {
                coreBootstrap.loadBinding('simplexxx', {}, function(){});
            }).to.throw(BootstrapError, 'Invalid binding');
        });
        it('should throw on incomplete binding', function() {
            expect(function() {
                coreBootstrap.loadBinding('simple_missing', {}, function(){});
            }).to.throw(BootstrapError, 'Missing properties: ');
        });
        it('should use props', function(done) {
            expect(function() {
                coreBootstrap.loadBinding('simple_missing', {"reboot_strategy":"etcd-lock"}, function(config) {
                    expect(config).to.equals(`#cloud-config
ssh_authorized_keys: []
hostname: ''
coreos:
  update:
    reboot-strategy: etcd-lock
  units: []
write_files: []
`);
                    done();
                });
            }).to.throw(BootstrapError, 'Missing properties: ');
        });
    });
    describe('loadView', function() {
        it('should throw on undefined binding', function() {
            expect(function() {
                coreBootstrap.loadView(undefined, function(){});
            }).to.throw(BootstrapError, 'Invalid binding');
        });
        it('should throw on invalid binding', function() {
            expect(function() {
                coreBootstrap.loadView('simplexxx', function(){});
            }).to.throw(BootstrapError, 'Invalid binding');
        });
        it('should call onReady on ready', function(done) {
            coreBootstrap.loadView('simple', function() {
                done();
            });
        });
        it('should list all datas from simple', function(done) {
            coreBootstrap.loadView('simple', function(view) {
                expect(view).to.equals(`reboot_strategy=etcd-lock
`);
                done();
            });
        });
        it('should list all datas from double_data', function(done) {
            coreBootstrap.loadView('double_data', function(view) {
                expect(view).to.equals(`ipaddr=
reboot_strategy=etcd-lock
`);
                done();
            });
        });
    });
    describe('loadMissing', function() {
        it('should throw on undefined binding', function() {
            expect(function() {
                coreBootstrap.loadMissing(undefined, function(){});
            }).to.throw(BootstrapError, 'Invalid binding');
        });
        it('should throw on invalid binding', function() {
            expect(function() {
                coreBootstrap.loadMissing('simplexxx', function(){});
            }).to.throw(BootstrapError, 'Invalid binding');
        });
        it('should call onReady on ready', function(done) {
            coreBootstrap.loadMissing('simple', function() {
                done();
            });
        });
        it('should find missing data', function(done) {
            coreBootstrap.loadMissing('simple_missing', function(config) {
                expect(config).to.equals('reboot_strategy');
                done();
            });
        });
        it('should find two missing data', function(done) {
            coreBootstrap.loadMissing('simple_missings_two', function(config) {
                expect(config).to.equals('reboot_strategy channel');
                done();
            })
        });
        it('should find three missing data', function(done) {
            coreBootstrap.loadMissing('simple_missings_three', function(config) {
                expect(config).to.equals('reboot_strategy update_server channel');
                done();
            })
        });
        it('should find ordered missing data', function(done) {
            coreBootstrap.loadMissing('simple_missing_order', function(config) {
                expect(config).to.equals('reboot_strategy channel update_server');
                done();
            })
        });
        it('should find no missing data', function(done) {
            coreBootstrap.loadMissing('simple', function(config) {
                expect(config).to.equals('');
                done();
            });
        });
    });
    describe('loadMissingParam', function() {
        it('should return empty if attribute is not found', function(done) {
            coreBootstrap.loadMissingParam('simple', 'reboot_strategy_xxx', function(attr) {
                expect(attr).to.equals('');
                done();
            })
        });
        it('should list param\'s attributes', function(done) {
            coreBootstrap.loadMissingParam('simple', 'reboot_strategy', function(attr) {
                expect(attr).to.equals(`__opt=echo 'etcd-lock|reboot|off'
_default=$__opt
_regex_validate=^(\${__opt})\$
`);
                done();
            })
        });
    });
    describe('loadParams', function() {
        it('should throw on undefined binding', function() {
            expect(function() {
                coreBootstrap.loadInstallParams(undefined, function(){});
            }).to.throw(BootstrapError, 'Invalid binding');
        });
        it('should throw on invalid binding', function() {
            expect(function() {
                coreBootstrap.loadInstallParams('simplexxx', function(){});
            }).to.throw(BootstrapError, 'Invalid binding');
        });
        it('should call onReady on ready', function(done) {
            coreBootstrap.loadInstallParams('simple', function() {
                done();
            });
        });
        it('should list installation params', function(done) {
            coreBootstrap.loadInstallParams('simple', function(params) {
                expect(params).to.equals('coreos_channel=stable\ndevice=/dev/sda\n');
                done();
            });
        });
        it('should use params from bindings', function(done) {
            coreBootstrap.loadInstallParams('simple_beta', function(params) {
                expect(params).to.equals('coreos_channel=beta\n')
                done();
            });
        });
    });
});
