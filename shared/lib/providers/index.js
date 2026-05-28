const binance = require('./binance');
const coinbase = require('./coinbase');
const yahoo = require('./yahoo');
const macro = require('./macro');
const alternative = require('./alternative');
const fx = require('./fx');
const common = require('./common');
const weather = require('./weather');
const interest = require('./interest');
const alpaca = require('./alpaca');

module.exports = {
  ...binance,
  ...coinbase,
  ...yahoo,
  ...macro,
  ...alternative,
  ...fx,
  ...weather,
  ...interest,
  ...alpaca,
  ...common
};
