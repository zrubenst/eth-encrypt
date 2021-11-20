#!/usr/bin/env node

const fs = require('fs');
const Web3 = require('web3');
const commandLineArgs = require('command-line-args');
const getUsage = require('command-line-usage')
const chalk = require('chalk');
const { FILE_EXTENSION } = require('./utils/config');
const PrivateKeyProvider = require('./utils/private-key-provider');
const { resolveOutputFile, generateDefaultOutputFile } = require('./utils/fs-utils');
const { 
  generateEncryptionNote, 
  signEncryptionNote, 
  signedEncryptionNoteToKey, 
  encryptFileAsStream,
  decryptFileAsStream,
  readEncryptionNoteFromFile
} = require('./index.js');

console.log(); // Add buffer for all output

const commandDefinitions = [
  { name: 'command', defaultOption: true },
  { name: 'help', alias: 'h', type: Boolean },
  { name: 'version', type: Boolean },
];

const actionOptionDefinitions = [
  { 
    name: 'fileName', 
    type: String, 
    defaultOption: true,
    description: 'This is the default option and does not need a flag.'
  },
  { 
    name: 'private-key', 
    alias: 'k', 
    type: String,
    typeLabel: '{underline privateKey}',
    description: 'The Ethereum private key used to encrypt or decrypt files'
  },
  { 
    name: 'rpc-url', 
    alias: 'u', 
    type: String,
    typeLabel: '{underline rpcUrl}',
    description: 'Url for Ethereum RPC with a hot wallet to request signatures to'
  },
  { 
    name: 'output', 
    alias: 'o', 
    type: String,
    typeLabel: `{underline file.${FILE_EXTENSION}}`,
    description: `(Optional) The output file. Default: {italic file}.${FILE_EXTENSION}`
  },
  { 
    name: 'verbose', 
    alias: 'v', 
    type: Boolean,
    description: '(Optional) Outputs secure information. Not recommended.'
  }
];

const parsedCommand = commandLineArgs(commandDefinitions, { stopAtFirstUnknown: true });

if (parsedCommand.version) {
  console.log('version 1.0.0');
} else if (parsedCommand.help || !parsedCommand.command) {
  displayHelpMenu();
} else {
  const options = commandLineArgs(actionOptionDefinitions, { argv: parsedCommand._unknown || [] });
  
  switch (parsedCommand.command) {
    case 'encrypt':
      processAction('encrypt', options);
      break;
    
    case 'decrypt':
      processAction('decrypt', options);
      break;
    
    default:
      displayError(`Unknown command: ${parsedCommand.command}`);
      break;
  }
}

// ----------------------------

function processAction(actionType, options) {
  const fileName = options.fileName;
  const privateKey = options['private-key'];
  const rpcUrl = options['rpc-url'];

  if (!fileName) {
    displayError('No file name given');
    return;
  }

  if (!fs.existsSync(fileName)) {
    displayError(`File does not exist: ${fileName}`);
    return;
  }

  if (!privateKey && !rpcUrl) {
    displayError('One of --private-key or --rpc-url required');
    return;
  }

  if (privateKey && rpcUrl) {
    displayError('Choose one of --private-key or --rpc-url');
    return;
  }

  let provider;

  if (privateKey) {
    const sanitizedPK = privateKey.replace('0x', '');
    var privateKeyProvider = new PrivateKeyProvider(sanitizedPK);
    provider = new Web3(privateKeyProvider);
    provider.eth.defaultAccount = privateKeyProvider.address;
  } else if (rpcUrl) {
    provider = {};
  }

  if (actionType === 'encrypt') {
    processFileEncryption(fileName, provider, options);
  } else if (actionType === 'decrypt') {
    processFileDecryption(fileName, provider, options);
  }
}

function processFileEncryption(fileName, provider, options) {
  const userAddress = provider.eth.defaultAccount;
  let outputFileName = options.output || generateDefaultOutputFile(fileName, 'encrypt');
  const encryptionNote = generateEncryptionNote();

  console.log(chalk.cyan('Encrypting file: ') + fileName);
  console.log(chalk.cyan('Your address:    ') + userAddress);
  if (options.verbose) console.log(chalk.yellow('Encryption Note: ') + encryptionNote);
  console.log('');

  process.stdout.write(chalk.bold('Requesting signature... '));
  
  signEncryptionNote(encryptionNote, provider, signedEncryptionNote => {
    console.log(chalk.bold.green('Done') + '.');
    process.stdout.write(chalk.bold(`Encrypting ${fileName}... `));

    outputFileName = resolveOutputFile(outputFileName);
    
    encryptFileAsStream(fileName, outputFileName, encryptionNote, signedEncryptionNote);
    
    console.log(chalk.bold.green('Done') + '.');
    displayFinishedText('encrypt');
    console.log('Your file has been encrypted as ' + chalk.bold.cyan(outputFileName));

    if (options.verbose) {
      const verboseEncryptionKey = signedEncryptionNoteToKey(signedEncryptionNote);
      console.log(chalk.yellow('Encryption Key (Password): ') + verboseEncryptionKey.toString('hex'));
    }

    console.log();
  }, error => handleRuntimeError(error, options));
}

function processFileDecryption(fileName, provider, options) {
  const userAddress = provider.eth.defaultAccount;
  let outputFileName = options.output || generateDefaultOutputFile(fileName, 'decrypt');
  const encryptionNote = readEncryptionNoteFromFile(fileName);
  
  console.log(chalk.cyan('Decrypting file:      ') + fileName);
  console.log(chalk.cyan('Encryptor\'s address:    ') + chalk.gray('Unknown'));
  console.log(chalk.cyan('Your address:         ') + userAddress);
  if (options.verbose) console.log(chalk.yellow('Encryption Note:      ') + encryptionNote);
  console.log('');

  process.stdout.write(chalk.bold('Requesting signature... '));

  signEncryptionNote(encryptionNote, provider, signedEncryptionNote => {
    console.log(chalk.bold.green('Done') + '.');
    process.stdout.write(chalk.bold(`Decrypting ${fileName}... `));

    outputFileName = resolveOutputFile(outputFileName);
    
    decryptFileAsStream(fileName, outputFileName, signedEncryptionNote);
    
    console.log(chalk.bold.green('Done') + '.');
    displayFinishedText('decrypt');
    console.log('Your file has been decrypted to ' + chalk.bold.cyan(outputFileName));

    if (options.verbose) {
      const verboseEncryptionKey = signedEncryptionNoteToKey(signedEncryptionNote);
      console.log(chalk.yellow('Encryption Key Used (Password): ') + verboseEncryptionKey.toString('hex'));
    }

    console.log();
  }, error => handleRuntimeError(error, options));
}

// ----------------------------

function displayHelpMenu() {
  const ethHeader = chalk.cyan(`
        ░░░░░    ░░     ░░░░░    ░░░░
      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  ░  ░░░░ ███████╗████████╗██╗  ██╗ ░░░░░░
     ░░░░ ██╔════╝╚══██╔══╝██║  ██║ ░░░░ ░░
    ░░░░░ █████╗ ░░░ ██║ ░ ███████║ ░░░░░░
   ░░ ░░░ ██╔══╝ ░░░ ██║ ░ ██╔══██║ ░░░ ░  ░
      ░░░ ███████╗ ░ ██║ ░ ██║  ██║ ░░░░░░
    ░░░░░ ╚══════╝ ░ ╚═╝ ░ ╚═╝  ╚═╝ ░░░  ░░`);

  const encryptHeader = chalk.red(`
  ░░░ █▀▀▀ █▀▀▄ █▀▀ █▀▀█ █  █ █▀▀█ ▀▀█▀▀ ░░ ░ 
   ░░ █▀▀▀ █  █ █   █▄▄▀ █▄▄█ █  █   █ ░░ 
  ░ ░ █▄▄▄ ▀  ▀ ▀▀▀ ▀ ▀▀ ▄▄▄█ █▀▀▀   ▀ ░░░ ░
    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ░░
  ░  ░░░░░    ░░░░░░    ░░░    ░░░░░   ░░ 
  `);

  const sections = [
    {
      content: `${ethHeader}${encryptHeader}`,
      raw: true
    },
    {
      header: 'Available Commands',
      content: [
        '$ eth-encrypt {bold encrypt} {underline file} [{bold --private-key} {underline privateKey}] [{bold --rpc-url} {underline rpcUrl}]',
        `$ eth-encrypt {bold decrypt} {underline file.${FILE_EXTENSION}} [{bold --private-key} {underline privateKey}] [{bold --rpc-url} {underline rpcUrl}]`,
        '$ eth-encrypt {bold --version}',
        '$ eth-encrypt {bold --help}'
      ]
    },
    {
      header: 'Available Options',
      optionList: actionOptionDefinitions.slice(1)
    }
  ];

  console.log(getUsage(sections))
}

function displayError(text, showHelpOffer = true) {
  if (showHelpOffer) {
    console.log(chalk.red(text) + '. For help, please run:');
    console.log('\n  $ eth-encrypt -h\n');
  } else {
    console.log(chalk.red(text) + '.' + '\n');
  }
}

function handleRuntimeError(error, options = {}) {
  console.log(chalk.bold.red('Failed') + '.');

  if (options.verbose) {
    console.log('\n' + chalk.bold.yellow('Full Error:'));
    console.log(error);
    console.log();
  }
}

function displayFinishedText(actionType) {
  const doneText = chalk.green(`
          ░░░    ░░   ░░░░░  
        ░░░░░░░░░░ ░░░░░░░░░░░░░ ░░
    ░░ ░░░░ █▀▀▄ █▀▀█ █▀▀▄ █▀▀ ░░░ ░
      ░ ░░░ █  █ █  █ █  █ █▀▀ ░░░
      ░░ ░░ █▄▄▀ ▀▀▀▀ ▀  ▀ ▀▀▀ ░░░░ ░░
        ░░░░░░░░░░░░░░░ ░░░░░░░░░ ░░
             ░░   ░░░░     ░░
  `);

  const lockedLogo = chalk.magenta(`
            ░░ ░   ░░  ░░░ ░░░
          ░ ░░░ ░░░░░░░░░░  ░░ ░
       ░ ░   ░░░░░ ▄▀▀▀▄ ░░░░░░  ░░░
          ░░  ░░░ █     █ ░░░ ░ ░░
       ░░  ░░░░░ █████████ ░░░░░░░ ░░
         ░░░░░ ░ ████░████ ░░░ ░░ 
           ░ ░░░ ▀███████▀ ░ ░░░ ░░░
            ░░░ ░░░░░░░░░░░ ░░  ░
              ░░  ░░░░ ░ ░░
             ░░   ░         ░░
  `);

  const unlockedLogo = chalk.green(`
            ░░ ░   ░░  ░░░ ░░░
          ░ ░░░ ░░░░░░░░░░  ░░ ░
       ░ ░   ░░░░░ ▄▀▀▀▄ ░░░░░░░  ░░
          ░░  ░░░ █     █ ░░░ ░ ░░
          ░░░░░░░ █       ░░ ░░░░░ ░
       ░░  ░░░░░ █████████ ░░░░░░░ ░░
         ░░░░░ ░ ████ ████ ░░░ ░░ 
           ░ ░░░ ▀███████▀ ░ ░░░ ░░░
            ░░░ ░░░░░░░░░░░ ░░  ░
              ░░  ░░░░ ░ ░░
             ░░   ░         ░░
  `);

  if (actionType === 'encrypt') {
    console.log(lockedLogo);
  } else if (actionType === 'decrypt') {
    console.log(unlockedLogo);
  } else {
    console.log(doneText);
  }
}



// const doneText = chalk.green(`
//           ░░░    ░░   ░░░░░  
//         ░░░░░░░░░░ ░░░░░░░░░░░░░ ░░
//     ░░ ░░░░ █▀▀▄ █▀▀█ █▀▀▄ █▀▀ ░░░ ░
//       ░ ░░░ █  █ █  █ █  █ █▀▀ ░░░
//       ░░ ░░ █▄▄▀ ▀▀▀▀ ▀  ▀ ▀▀▀ ░░░░ ░░
//         ░░░░░░░░░░░░░░░ ░░░░░░░░░ ░░
//              ░░   ░░░░     ░░
//   `);

//   █ ▀ ▄ ▀
 
//         ░░ ░   ░░  ░░░ ░░░
//        ░ ░░░ ░░░░░░░░░░  ░░ ░
//    ░ ░   ░░░░░ ▄▀▀▀▄ ░░░░░░░░░░░
//       ░░  ░░░ █     █ ░░░ ░ ░░
//    ░░  ░░░░░ █████████ ░░░░░░░ ░░
//      ░░░░░ ░ ████░████ ░░░ ░░ 
//        ░ ░░░ ▀███████▀ ░ ░░░ ░░░
//         ░░░ ░░░░░░░░░░░ ░░  ░
//           ░░  ░░░░ ░ ░░
//          ░░   ░         ░░

//    ▄▀▀▀▄
//   █     █
//   █     
//  █████████
//  ████ ████
//  ▀███████▀