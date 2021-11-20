const ProviderEngine = require("web3-provider-engine");
const WalletSubprovider = require('web3-provider-engine/subproviders/wallet');
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc');
const Wallet = require('ethereumjs-wallet').default;

function PrivateKeyProvider(privateKey) {
  if (!privateKey) {
    throw new Error(`Private Key missing, non-empty string expected, got "${privateKey}"`);
  }

  if (privateKey.startsWith('0x')) {
    privateKey = privateKey.substr(2, privateKey.length);
  }

  this.wallet = new Wallet(new Buffer.from(privateKey, "hex"));
  this.address = "0x" + this.wallet.getAddress().toString("hex");

  this.engine = new ProviderEngine({ blockTracker: { on: () => {} } });
  this.engine.addProvider(new WalletSubprovider(this.wallet, {}));
  this.engine.start();
}

PrivateKeyProvider.prototype.sendAsync = function() {
  this.engine.sendAsync.apply(this.engine, arguments);
};

PrivateKeyProvider.prototype.send = function() {
  return this.engine.send.apply(this.engine, arguments);
};


module.exports = PrivateKeyProvider;