'use strict';

const expect = require('chai').expect;
const utils = require('../lib/utils');
const BootstrapError = utils.BootstrapError;
const isObject = utils.isObject;
const merge = utils.merge;

describe('util', function() {
    describe('BootstrapError', function() {
        it('should evaluate to it\'s own message', function() {
            const err = new BootstrapError('fail');
            const msg = "" + err;
            expect(msg).to.equals('fail');
        });
    });
    describe('isObject', function() {
        it('should return true on {}', function() {
            expect(isObject({})).to.equals(true);
        });
        it('should return true on {"a":1}', function() {
            expect(isObject({"a":1})).to.equals(true);
        });
        it('should return true on f()', function() {
            expect(isObject(function(){})).to.equals(true);
        });
        it('should return false on undefined', function() {
            expect(isObject(undefined)).to.equals(false);
        });
        it('should return false on []', function() {
            expect(isObject([])).to.equals(false);
        });
    });
    describe('merge', function() {
        it('should override attributes', function() {
            var v1 = { "a": 1, "b": 2 };
            var v2 = { "a": 3, "b": 4 };
            var m = merge(v1, v2);
            expect(m).to.deep.equal({ "a": 3, "b": 4 });
        });
        it('should merge attributes', function() {
            var v1 = { "a": 1 };
            var v2 = { "b": 2 };
            var m = merge(v1, v2);
            expect(m).to.deep.equal({ "a": 1, "b": 2 })
        });
        it('should merge arrays', function() {
            var v1 = [1, 2, 3];
            var v2 = [2, 4, 8];
            var m = merge(v1, v2);
            expect(m).to.deep.equal([1, 2, 3, 2, 4, 8]);
        });
        it('should deep merge object', function() {
            var v1 = {
                "a": {
                    "z": [1, 2, 3]
                },
                "b": [4, 5, 6]
            };
            var v2 = {
                "a": {
                    "z": [2, 4, 8]
                },
                "b": [4, 8, 16]
            };
            var m = merge(v1, v2);
            expect(m).to.deep.equal({
                "a": {
                    "z": [1, 2, 3, 2, 4, 8]
                },
                "b": [4, 5, 6, 4, 8, 16]
            });
        });
    });
});
