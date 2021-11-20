const fs = require('fs');
const { Transform } = require('stream');
const { FILE_EXTENSION, DECRYPTED_FILE_EXTENSION } = require('./config');

function _replaceLastOccurance(str, search, replace) {
  return str.replace(new RegExp(search+"([^"+search+"]*)$"), replace+"$1");
}

function _appendToFilename(filename, string) {
  const lastSlashIndex = filename.lastIndexOf('/');
  const lastDotIndex = filename.indexOf('.', lastSlashIndex);
  if (lastDotIndex == -1) return filename + string;
  else return filename.substring(0, lastDotIndex) + string + filename.substring(lastDotIndex);
} 

function resolveOutputFile(outputFileName, i = 0) {
  const testFileName = i ? _appendToFilename(outputFileName, `-dup-${i}`) : outputFileName;
  
  if (fs.existsSync(testFileName)) {
    return resolveOutputFile(outputFileName, i + 1);
  }

  return testFileName;
}

function generateDefaultOutputFile(inputFileName, actionType) {
  if (actionType === 'encrypt') {
    return inputFileName + '.' + FILE_EXTENSION;
  } else if (actionType === 'decrypt') {
    if (inputFileName.endsWith(`.${FILE_EXTENSION}`)) {
      return _replaceLastOccurance(inputFileName, `.${FILE_EXTENSION}`, '');
    } else {
      return inputFileName + '.' + DECRYPTED_FILE_EXTENSION;
    }
  }
}

class PrependInitializationVector extends Transform {
  constructor(iv, opts) {
    super(opts);
    this.iv = iv;
    this.prepended = false;
  }

  _transform(chunk, encoding, cb) {
    if (!this.prepended) {
      this.push(this.iv);
      this.prepended = true;
    }
    this.push(chunk);
    cb();
  }
}

function partialReadSync(path, start, end) {
  if (start < 0 || end < 0 || end < start || end - start > 0x3fffffff)
    throw new Error('bad start, end');
  if (end - start === 0)
    return new Buffer.from(0);

  var buf = new Buffer.alloc(end - start);
  var fd = fs.openSync(path, 'r');
  fs.readSync(fd, buf, 0, end - start, start);
  fs.closeSync(fd);
  return buf;
}

module.exports = {
  resolveOutputFile,
  generateDefaultOutputFile,
  PrependInitializationVector,
  partialReadSync
};
