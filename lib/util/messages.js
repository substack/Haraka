exports.warning = function (msg) {
    console.error('\x1b[31mwarning\x1b[0m: ' + msg);
}

exports.create = function (path) {
    console.log('\x1b[32mcreate\x1b[0m: ' + path);
}

exports.fail = function (msg) {
    console.error('\x1b[31merror\x1b[0m: ' + msg);
    process.exit(-1);
}
