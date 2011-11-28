var messages = require('./messages');

// Make directory if NOT exist
module.exports = function mkDir (dstPath) {
    try {
        fs.mkdirSync(dstPath, fs.statSync(__dirname).mode);
        messages.create(dstPath)
    }
    catch (e) {
        // File exists
        if (e.errno = 17) {
            messages.warning(e.message);
        }
        else {
            throw e;
        }
    }
}
