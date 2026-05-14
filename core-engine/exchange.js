import ccxt from 'ccxt';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const exchange = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_API_SECRET,
    enableRateLimit: true,
    options: {
        defaultType: 'future'
    }
});

// TERHUBUNG KE BINANCE FUTURES MAINNET (REAL MARKET)
// Peringatan: Bot sekarang berjalan menggunakan dana nyata (Real Funds).

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function withRetry(apiCallFn, maxRetries = 3, delayMs = 5000) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await apiCallFn();
        } catch (error) {
            attempt++;
            const isRateLimit = error instanceof ccxt.RateLimitExceeded;
            const isNetworkError = error instanceof ccxt.NetworkError;

            if ((isRateLimit || isNetworkError) && attempt < maxRetries) {
                console.warn(`[API Error] ${error.name}: ${error.message}. Retrying in ${delayMs / 1000}s (Attempt ${attempt}/${maxRetries})...`);
                await sleep(delayMs);
            } else {
                console.error(`[API Error] Failed after ${attempt} attempts:`, error.message);
                throw error;
            }
        }
    }
}

export async function checkConnectionAndBalance() {
    console.log('Fetching balance from Binance Futures Mainnet (REAL)...');
    const balance = await withRetry(() => exchange.fetchBalance());

    // Usually ccxt places the free/total values in balance['USDT']
    const usdtBalance = balance['USDT'] ? balance['USDT'].total : 0;
    console.log(`USDT Balance: ${usdtBalance}`);
    return usdtBalance;
}

export async function fetchMarketRadar(symbol) {
    console.log(`Fetching Market Radar for ${symbol}...`);
    
    // Fetch last 20 candles for 15m timeframe
    const ohlcv = await withRetry(() => exchange.fetchOHLCV(symbol, '15m', undefined, 20));
    
    // Fetch top 20 bids/asks in the order book
    const orderBook = await withRetry(() => exchange.fetchOrderBook(symbol, 20));
    
    return {
        symbol,
        timeframe: '15m',
        ohlcv,
        orderBook
    };
}
