"use strict";
// Log class

var config    = require('./config');
var plugins;
var constants = require('./constants');
var util      = require('util');

var logger = exports;

logger.LOGDATA      = 9;
logger.LOGPROTOCOL  = 8;
logger.LOGDEBUG     = 7;
logger.LOGINFO      = 6;
logger.LOGNOTICE    = 5;
logger.LOGWARN      = 4;
logger.LOGERROR     = 3;
logger.LOGCRIT      = 2;
logger.LOGALERT     = 1;
logger.LOGEMERG     = 0;

logger.loglevel = logger.LOGWARN;

var deferred_logs = [];

logger.dump_logs = function () {
    while (deferred_logs.length > 0) {
        var log_item = deferred_logs.shift();
        console.log(log_item.data);
    }
}

logger.log = function (level, data) {
    data = data.replace(/\r?\n/g, "\\n");
    // todo - just buffer these up (defer) until plugins are loaded
    if (plugins.plugin_list) {
        while (deferred_logs.length > 0) {
            var log_item = deferred_logs.shift();
            plugins.run_hooks('log', logger, log_item);
        }
        plugins.run_hooks('log', logger, {
            'level' : level,
            'data'  : data
        });
    }
    else {
        deferred_logs.push({
            'level' : level,
            'data'  : data
        });
    }
}

logger.log_respond = function (retval, msg, data) {
    // any other return code is irrelevant
    if (retval === constants.cont) {
        return console.log(data.data);
    }
};

// TODO: would be nice if there were some way to reload the loglevel
logger._init_loglevel = function () {
    var _loglevel = config.get('loglevel');
    if (_loglevel) {
        var loglevel_num = parseInt(_loglevel);
        if (!loglevel_num || loglevel_num === NaN) {
            logger.loglevel = logger[_loglevel.toUpperCase()];
        }
        else {
            logger.loglevel = loglevel_num;
        }
        if (!logger.loglevel) {
            logger.loglevel = logger.LOGWARN;
        }
    }
};

logger._init_loglevel();

var level, key;
for (key in logger) {
    if(logger.hasOwnProperty(key)) {
        if (key.match(/^LOG\w/)) {
            level = key.slice(3);
            logger[key.toLowerCase()] = (function(level, key) {
                return function() {
                    if (logger.loglevel < logger[key])
                        return;
                    var str = "[" + level + "] ";
                    for (var i = 0; i < arguments.length; i++) {
                        var data = arguments[i];
                        if (typeof(data) === 'object') {
                            str += util.inspect(data);
                        }
                        else {
                            str += data;
                        }
                    }
                    logger.log(level, str);
                }
            })(level, key);
        }
    }
}

// load this down here so it sees all the logger methods compiled above
plugins = require('./plugins');
