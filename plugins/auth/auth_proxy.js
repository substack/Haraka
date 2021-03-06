// Proxy AUTH requests selectively by domain
var sock = require('./line_socket');
var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

exports.register = function () {
    this.inherits('auth/auth_base');
}

exports.hook_capabilities = function (next, connection) {
    var config = this.config.get('auth_proxy.ini');
    if (connection.using_tls) {
        var methods = [ 'PLAIN', 'LOGIN' ];
        connection.capabilities.push('AUTH ' + methods.join(' '));
        connection.notes.allowed_auth_methods = methods;
    }
    next();
}

exports.check_plain_passwd = function (user, passwd, cb) {
    var domain;
    if ((domain = /@([^@]+)$/.exec(user))) {
        var domain = domain[1].toLowerCase();
    } else {
        // AUTH user not in user@domain.com format
        this.logerror('AUTH user="' + user + '" error="not in required format"');
        return cb(false);
    }

    // Check if domain exists in configuration file
    var config = this.config.get('auth_proxy.ini');
    if (!config.domains[domain]) {
        this.logerror('AUTH user="' + user + '" error="domain \'' + domain + '\' is not defined"');
        return cb(false);
    }

    this.try_auth_proxy(config.domains[domain].split(/[,; ]/), user, passwd, cb);
}

exports.try_auth_proxy = function (hosts, user, passwd, cb) {
    if (!hosts || (hosts && !hosts.length)) return cb(false);
    if (typeof hosts !== 'object') {
        hosts = [ hosts ];
    }

    var self = this;
    var host = hosts.shift();
    var methods = [];
    var auth_complete = false;
    var auth_success = false;
    var command = 'connect';
    var response = [];

    var hostport = host.split(/:/)
    var socket = sock.connect(((hostport[1]) ? hostport[1] : 25), hostport[0]);
    this.logdebug('attempting connection to host=' + hostport[0] + ' port=' + ((hostport[1]) ? hostport[1] : 25));
    socket.setTimeout(30 * 1000);
    socket.on('connect', function () {
    });
    socket.on('close', function () {
        if (!auth_complete) {
            // Try next host
            return self.try_auth_proxy(hosts, user, passwd, cb);
        }
        self.loginfo('AUTH user="' + user + '" host="' + host + '" success=' + auth_success);
        return cb(auth_success);
    });
    socket.on('timeout', function () {
        self.logerror("connection timed out");
        socket.end();
        // Try next host
        return self.try_auth_proxy(hosts, user, passwd, cb);
    });
    socket.on('error', function (err) {
        self.logerror("connection failed to host " + host + ": " + err);
        return self.try_auth_proxy(hosts, user, passwd, cb);
    });
    socket.send_command = function (cmd, data) {
        var line = cmd + (data ? (' ' + data) : '');
        if (cmd === 'dot') {
            line = '.';
        }
        self.logprotocol("C: " + line);
        command = cmd.toLowerCase();
        this.write(line + "\r\n");
        // Clear response buffer from previous command
        response = [];
    };
    socket.on('line', function (line) {
        var matches;
        self.logprotocol("S: " + line);
        if (matches = smtp_regexp.exec(line)) {
            var code = matches[1],
                cont = matches[2],
                rest = matches[3];
            response.push(rest);
            if (cont === ' ') {
                self.logdebug('command state: ' + command);
                if (command === 'ehlo') {
                    if (code.match(/^5/)) {
                        // EHLO command rejected; we have to abort
                        socket.send_command('QUIT');
                        return;
                    }
                    // Parse CAPABILITIES
                    var i;
                    for (i in response) {
                        if (response[i].match(/^STARTTLS/)) {
                            var key = self.config.get('tls_key.pem', 'data').join("\n");
                            var cert = self.config.get('tls_cert.pem', 'data').join("\n");
                            // Use TLS opportunistically if we found the key and certificate
                            if (key && cert) {
                                this.on('secure', function () {
                                    socket.send_command('EHLO', self.config.get('me'));
                                });
                                socket.send_command('STARTTLS');
                                return;
                            }
                        }
                        else if (response[i].match(/^AUTH /)) {
                            // Parse supported AUTH methods
                            var parse = /^AUTH (.+)$/.exec(response[i]);
                            methods = parse[1].split(/\s+/);
                            self.logdebug('found supported AUTH methods: ' + methods);
                            // Prefer PLAIN as it's easiest
                            if (methods.indexOf('PLAIN') !== -1) {
                                socket.send_command('AUTH','PLAIN ' + self.base64("\0" + user + "\0" + passwd));
                                return;
                            }
                            else if (methods.indexOf('LOGIN') !== -1) {
                                socket.send_command('AUTH','LOGIN');
                                return;
                            }
                            else {
                                // No compatible methods; abort...
                                self.logdebug('no compatible AUTH methods');
                                socket.send_command('QUIT');
                                return;
                            }
                        }
                    }
                }
                if (command === 'auth') {
                    // Handle LOGIN
                    if (code[0] === '3' && response[0] === 'VXNlcm5hbWU6') {
                        // Write to the socket directly to keep the state at 'auth'
                        this.write(self.base64(user) + "\r\n");
                        response = [];
                        return;
                    } else if (code[0] === '3' && response[0] === 'UGFzc3dvcmQ6') {
                        this.write(self.base64(passwd) + "\r\n");
                        response = [];
                        return;
                    }
                    if (code[0] === '5') {
                        // Initial attempt failed; strip domain and retry.
                        var u; 
                        if ((u = /^([^@]+)@.+$/.exec(user))) {
                            user = u[1];
                            if (methods.indexOf('PLAIN') !== -1) {
                                socket.send_command('AUTH', 'PLAIN ' + self.base64("\0" + user + "\0" + passwd));
                            } else if (methods.indexOf('LOGIN') !== -1) {
                                socket.send_command('AUTH', 'LOGIN');
                            }
                            return;
                        } else {
                            // Don't attempt any other hosts
                            auth_complete = true;
                        }
                    }
                }
                if (/^[345]/.test(code)) {
                    // Got an unhandled error
                    self.logdebug('error: ' + line);
                    socket.send_command('QUIT');
                    return;
                }
                switch (command) {
                    case 'starttls':
                        var tls_options = { key: key, cert: cert };
                        this.upgrade(tls_options);
                        break;
                    case 'connect':
                        socket.send_command('EHLO', self.config.get('me'));
                        break;
                    case 'auth':
                        // AUTH was successful
                        auth_complete = true;
                        auth_success = true;
                        socket.send_command('QUIT');
                        break;
                    case 'ehlo':
                    case 'helo':
                    case 'quit':
                        socket.end();
                        break;
                    default:
                        throw new Error("unknown command: " + command);
                }
            }
        }
        else {
            // Unrecognised response.
            self.logerror("unrecognised response: " + line);
            socket.end();
            return;
        }
    });
};
