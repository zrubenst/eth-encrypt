const fs = require('fs')
const crypto = require('crypto');

const {
  ETH_ENCRYPT_MESSAGE,
  ENCRYPTION_ALGORITHM,
  ENCRYPTION_KEY_SIZE,
  ENCRYPTION_IV_SIZE
} = require('./utils/config');

const { PrependInitializationVector, partialReadSync } = require('./utils/fs-utils');

function generateEncryptionNote() {
  return crypto.randomBytes(ENCRYPTION_IV_SIZE).toString("hex");
}

function signEncryptionNote(note, provider, cb, errorCb) {
  const signatureMessage = `${ETH_ENCRYPT_MESSAGE}${note}`;
  const address = provider.eth.defaultAccount;
  
  provider.eth.personal.sign(signatureMessage, address, '', (err, sig) => {
    if (sig) {
      cb(sig)
    } else {
      errorCb(err);
    }
  });
}

function signedEncryptionNoteToKey(signedEncryptionNote) {
  // Needs to be ENCRYPTION_KEY_SIZE bytes (take first ENCRYPTION_KEY_SIZE from sig)
  const sanitizedSignature = signedEncryptionNote.replace('0x', '').substring(0, ENCRYPTION_KEY_SIZE * 2);
  return Buffer.from(sanitizedSignature, 'hex');
}

// ------------------
// Encryption

function _createCipher(encryptionNote, signedEncryptionNote) {
  // The initialization vector (iv) is signed by the user
  const iv = Buffer.from(encryptionNote, 'hex'); 

  // This signature acts as the encryption key, 
  const encryptionKey = signedEncryptionNoteToKey(signedEncryptionNote);
  
  return crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
}

function encryptBytes(data, encryptionNote, signedEncryptionNote) {
  const cipher = _createCipher(encryptionNote, signedEncryptionNote);
  let encryptedData = cipher.update(Buffer.from(data));

  // Prepend iv (encryptionNote)
  return Buffer.concat([Buffer.from(encryptionNote, 'hex'), encryptedData, cipher.final()]);
}

function encryptFileAsStream(inputFileName, outputFileName, encryptionNote, signedEncryptionNote) {
  const readStream = fs.createReadStream(inputFileName);
  const cipher = _createCipher(encryptionNote, signedEncryptionNote);
  const prependIV = new PrependInitializationVector(Buffer.from(encryptionNote, 'hex'));
  const writeStream = fs.createWriteStream(outputFileName);

  readStream
    .pipe(cipher)
    .pipe(prependIV)
    .pipe(writeStream);
}

// ------------------
// Decryption

function _createDecipher(encryptionNote, signedEncryptionNote) {
  // The initialization vector (iv) is signed by the user
  const iv = Buffer.from(encryptionNote, 'hex'); 

  // This signature acts as the encryption key, 
  const encryptionKey = signedEncryptionNoteToKey(signedEncryptionNote);

  return crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
}

function readEncryptionNoteFromEncryptedBytes(data) {
  // Encryption note is the initialization vector (iv) stored in first ENCRYPTION_IV_SIZE bytes
 const ivBuffer = data.slice(0, ENCRYPTION_IV_SIZE);
 return ivBuffer.toString('hex');
}

function readEncryptionNoteFromFile(filename) {
  const ivBuffer = partialReadSync(filename, 0, ENCRYPTION_IV_SIZE);
  return ivBuffer.toString('hex');
}

function decryptBytes(data, signedEncryptionNote) {
  const ivBuffer = data.slice(0, ENCRYPTION_IV_SIZE);
  const contentBuffer = data.slice(ENCRYPTION_IV_SIZE);

  const decipher = _createDecipher(ivBuffer, signedEncryptionNote);
  let decryptedData = decipher.update(contentBuffer);
  return Buffer.concat([decryptedData, decipher.final()]);
}

function decryptFileAsStream(inputFileName, outputFileName, signedEncryptionNote) {
  const ivBuffer = Buffer.from(readEncryptionNoteFromFile(inputFileName), 'hex');
  const readStream = fs.createReadStream(inputFileName, { start: ENCRYPTION_IV_SIZE });
  const decipher = _createDecipher(ivBuffer, signedEncryptionNote);
  const writeStream = fs.createWriteStream(outputFileName);

  readStream
      .pipe(decipher)
      .pipe(writeStream);
}

// ------------------

module.exports = {
  generateEncryptionNote,
  signEncryptionNote,
  signedEncryptionNoteToKey,
  encryptBytes,
  decryptBytes,
  encryptFileAsStream,
  decryptFileAsStream,
  readEncryptionNoteFromFile,
  readEncryptionNoteFromEncryptedBytes
};



// let crypto = require('crypto');

// var iv = new Buffer.from('');   //(null) iv 
// var algorithm = 'aes-256-ecb';
// var password = 'a4e1112f45e84f785358bb86ba750f48';      //key password for cryptography

// function encrypt(buffer){
//     var cipher = crypto.createCipheriv(algorithm,new Buffer(password),iv)
//     var crypted = Buffer.concat([cipher.update(buffer),cipher.final()]);
//     return crypted;
// }

// console.log(encrypt(new Buffer('TextToEncrypt')).toString())




// function encrypt(text) {
//   let iv = crypto.randomBytes(IV_LENGTH);
//   let cipher = crypto.createCipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
//   let encrypted = cipher.update(text);
//   encrypted = Buffer.concat([encrypted, cipher.final()]);
//   return iv.toString('hex') + ':' + encrypted.toString('hex');
// }

// function decrypt(text) {
  // let textParts = text.split(':');
  // let iv = Buffer.from(textParts.shift(), 'hex');
  // let encryptedText = Buffer.from(textParts.join(':'), 'hex');
  // let decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  // let decrypted = decipher.update(encryptedText);
  // decrypted = Buffer.concat([decrypted, decipher.final()]);
  // return decrypted.toString();
// }



// function parseEncryptedFileBytes(fileBytes) {
//   return {
//     encryptionNote: null,
//     fileBytes: null
//   };
// }






// var fs = require('fs');
// var crypto = require('crypto');

// var key = '14189dc35ae35e75ff31d7502e245cd9bc7803838fbfd5c773cdcd79b8a28bbd';
// var cipher = crypto.createCipher('aes-256-cbc', key);
// var input = fs.createReadStream('test.txt');
// var output = fs.createWriteStream('test.txt.enc');

// input.pipe(cipher).pipe(output);

// output.on('finish', function() {
//   console.log('Encrypted file written to disk!');
// });