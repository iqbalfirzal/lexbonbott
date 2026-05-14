import ccxt from 'ccxt';
const ex = new ccxt.binance();
console.log(JSON.stringify(ex.urls.api, null, 2));
