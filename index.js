var logger = require('./logger');
logger.loglevel = 0;

var conn = require('./connection');
var plugins = require('./plugins');
var Server = require('./server');
var out = require('./outbound');

var net = require('net');

module.exports = function (params) {
    if (!params) params = {};
    if (typeof params === 'string') params = { basedir : params };
    
    if (!params.inactivity_timeout) params.inactivity_timeout = 600;
    if (!params.basedir) throw new Error('basedir parameter required');
    
    plugins.load_plugins();
    plugins.run_hooks('init_master', Server);
    
    var server = net.createServer(function (client) {
        client.setTimeout(params.inactivity_timeout * 1000);
        conn.createConnection(client, server);
    });
    
    var _listen = server.listen;
    server.listen = function () {
        var args = [].slice.call(arguments);
        
        var argv = args.reduce(function (acc, arg) {
            if (typeof arg === 'function') acc.cb = arg;
            else acc.args.push(arg);
            return acc;
        }, { args : [], cb : null });
        
        argv.args.push(function () {
            out.load_queue(params.queuedir || (params.basedir + '/queue'));
            Server.ready = 1;
            
            if (argv.cb) argv.cb();
        });
        
        return _listen.apply(server, argv.args);
    };
    
    return server;
};
