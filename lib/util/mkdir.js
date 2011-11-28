// Make directory if NOT exist
module.exports = function mkDir (dstPath) {
    try {
        fs.mkdirSync(dstPath, fs.statSync(__dirname).mode);
        create(dstPath)
    }
    catch (e) {
        // File exists
        if (e.errno = 17) {
            warning(e.message);
        }
        else {
            throw e;
        }
    }
}
