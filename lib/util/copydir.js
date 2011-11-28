// Warning messsage
var messages = require('./messages');
var mkDir = require('./mkdir');

// Copy directory
module.exports = function copyDir(srcPath, dstPath) {

    mkDir(dstPath);
    var files = fs.readdirSync(srcPath);
    
    for(var i = 0; i < files.length; i++) {
    
        // Ignore ".*"  
        if (/^\./.test(files[i])) {
            continue;
        }
    
        var srcFile = path.join(srcPath, files[i]);
        var dstFile = path.join(dstPath, files[i]);

        var srcStat = fs.statSync(srcFile);
      
        // Recursive call If direcotory
        if (srcStat.isDirectory()) {
            copyDir(srcFile, dstFile);
        }
        // Copy to dstPath if file
        else if (srcStat.isFile()) {
            // NOT overwrite file
            try {
                var dstStat = fs.statSync(dstFile);
                // File exists
                messages.warning("EEXIST, File exists '" + dstFile + "'");
            }
            catch (e) {
                // File NOT exists
                if (e.errno = 2) {
                    var data = fs.readFileSync(srcFile);
                    fs.writeFileSync(dstFile, data);
                    messages.create(dstFile)
                }
                else {
                    throw e;
                }
            }
        }
    }
}
