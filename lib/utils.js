exports.BootstrapError = BootstrapError;
exports.isObject = isObject;
exports.merge = merge;

function BootstrapError(message) {
    this.message = message;
    this.name = 'BootstrapError';
    this.toString = function() {
        return message;
    }
}

function isObject(obj) {
    return (obj instanceof Object) && !Array.isArray(obj);
}

function merge(cfg1, cfg2) {
    if (Array.isArray(cfg1) && Array.isArray(cfg2)) {
        cfg2.forEach(function(item) {
            cfg1.push(item);
        });
    } else if (isObject(cfg1) && isObject(cfg2)) {
        for(var item in cfg2) {
            cfg1[item] = merge(cfg1[item], cfg2[item]);
        }
    } else if (cfg2 !== undefined) {
        cfg1 = cfg2;
    }
    return cfg1;
}
