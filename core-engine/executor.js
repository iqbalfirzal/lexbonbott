import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadState, saveState } from './memory-manager.js';
import { exchangeInstance, withRetry } from './exchange.js';
import { normalizeSymbol } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const isDryRun = process.env.DRY_RUN === 'true';
const allocationUsdt = parseFloat(process.env.TRADE_ALLOCATION_USDT || '15');
const leverage = parseInt(process.env.LEVERAGE || '10', 10);
const marginMode = process.env.MARGIN_MODE || 'isolated';

export async function executeAction(action, currentPrice) {
    try {
        if (!action || !action.type) {
            return { executed: false, mode: isDryRun ? 'DRY_RUN' : 'LIVE', message: 'Invalid action object' };
        }

        const type = action.type.toUpperCase();

        if (type === 'STANDBY') {
            return { executed: false, mode: isDryRun ? 'DRY_RUN' : 'LIVE', side: 'STANDBY', message: 'Action is STANDBY. No trade executed.' };
        }

        if (type === 'BUY' || type === 'SELL') {
            const symbol = normalizeSymbol(action.market);
            
            // 1. Prevent Duplicate Positions
            if (isDryRun) {
                const state = loadState();
                const activeVirtual = state.active_virtual_trades || [];
                const isDuplicate = activeVirtual.some(t => t.symbol === symbol);
                if (isDuplicate) {
                    console.log(`[DRY RUN] Duplicate position prevented for ${symbol}.`);
                    return { executed: false, mode: 'DRY_RUN', side: type, message: `Duplicate virtual position prevented for ${symbol}.` };
                }
            } else {
                const positions = await withRetry(() => exchangeInstance.fetchPositions());
                const existingPosition = positions.find(p => p.symbol === symbol && parseFloat(p.contracts) > 0);
                if (existingPosition) {
                    console.log(`[LIVE] Duplicate position prevented for ${symbol}.`);
                    return { executed: false, mode: 'LIVE', side: type, message: `Duplicate live position prevented for ${symbol}.` };
                }
            }

            // 2. Load Markets for Limits & Precision
            await withRetry(() => exchangeInstance.loadMarkets());
            const marketInfo = exchangeInstance.markets[symbol];
            if (!marketInfo) {
                return { executed: false, mode: isDryRun ? 'DRY_RUN' : 'LIVE', side: type, message: `Market ${symbol} not supported by CCXT.` };
            }

            // 3. Dynamic Risk and Sizing from AI
            const slPercent = parseFloat(action.sl_percent || '2.0');
            const tpPercent = parseFloat(action.tp_percent || '1.5');
            const sizeWeight = parseFloat(action.size_weight || '1.0');
            
            const baseAllocation = allocationUsdt * sizeWeight;
            const notional = baseAllocation * leverage;
            
            // 4. Minimum Notional Check
            const minCost = marketInfo.limits.cost?.min || 5;
            if (notional < minCost) {
                return { executed: false, mode: isDryRun ? 'DRY_RUN' : 'LIVE', side: type, message: `Notional value ${notional.toFixed(2)} is less than minimum cost ${minCost}.` };
            }

            const rawSize = notional / currentPrice;
            const formattedSize = exchangeInstance.amountToPrecision(symbol, rawSize);
            
            let stopLossPrice, takeProfitPrice;

            if (type === 'BUY') {
                stopLossPrice = currentPrice * (1 - (slPercent / 100));
                takeProfitPrice = currentPrice * (1 + (tpPercent / 100));
            } else { // SELL
                stopLossPrice = currentPrice * (1 + (slPercent / 100));
                takeProfitPrice = currentPrice * (1 - (tpPercent / 100));
            }

            if (isDryRun) {
                console.log(`[DRY RUN] Simulating ${type} order for ${symbol}`);
                
                const state = loadState();
                if (!state.active_virtual_trades) state.active_virtual_trades = [];
                state.active_virtual_trades.push({
                    symbol: symbol,
                    side: type,
                    entry_price: currentPrice,
                    size: parseFloat(formattedSize),
                    sl: stopLossPrice,
                    tp: takeProfitPrice,
                    timestamp: Date.now()
                });
                saveState(state);

                return {
                    executed: true,
                    mode: 'DRY_RUN',
                    side: type,
                    size: parseFloat(formattedSize),
                    entry: currentPrice,
                    sl: stopLossPrice,
                    tp: takeProfitPrice,
                    message: `Simulated ${type} successfully.`
                };
            } else {
                console.log(`[LIVE] Executing ${type} order for ${symbol} with leverage ${leverage}x`);
                
                try {
                    // 5. Set Margin Mode
                    try {
                        await withRetry(() => exchangeInstance.setMarginMode(marginMode, symbol));
                    } catch (e) {
                        if (e.message && (e.message.includes('MarginModeAlreadySet') || e.message.includes('No need to change'))) {
                            // Safe to ignore
                        } else {
                            console.warn(`Could not set margin mode for ${symbol}:`, e.message);
                        }
                    }

                    // 6. Set Leverage
                    try {
                        await withRetry(() => exchangeInstance.setLeverage(leverage, symbol));
                    } catch (e) {
                        console.warn(`Could not set leverage for ${symbol}:`, e.message);
                    }
                    
                    const side = type.toLowerCase();
                    const inverseSide = side === 'buy' ? 'sell' : 'buy';

                    // 7. Entry Order
                    console.log(`Placing entry MARKET order: ${side} ${formattedSize} ${symbol}`);
                    const entryOrder = await withRetry(() => exchangeInstance.createMarketOrder(symbol, side, formattedSize));

                    // 8. SL and TP Orders
                    const slFormattedPrice = exchangeInstance.priceToPrecision(symbol, stopLossPrice);
                    const tpFormattedPrice = exchangeInstance.priceToPrecision(symbol, takeProfitPrice);

                    console.log(`Placing SL STOP_MARKET order at ${slFormattedPrice}`);
                    await withRetry(() => exchangeInstance.createOrder(symbol, 'STOP_MARKET', inverseSide, formattedSize, undefined, {
                        stopPrice: slFormattedPrice,
                        reduceOnly: true,
                        workingType: 'MARK_PRICE'
                    }));

                    console.log(`Placing TP TAKE_PROFIT_MARKET order at ${tpFormattedPrice}`);
                    await withRetry(() => exchangeInstance.createOrder(symbol, 'TAKE_PROFIT_MARKET', inverseSide, formattedSize, undefined, {
                        stopPrice: tpFormattedPrice,
                        reduceOnly: true,
                        workingType: 'MARK_PRICE'
                    }));

                    return {
                        executed: true,
                        mode: 'LIVE',
                        side: type,
                        size: parseFloat(formattedSize),
                        entry: currentPrice,
                        sl: stopLossPrice,
                        tp: takeProfitPrice,
                        message: `Live order placed successfully with SL and TP.`
                    };
                } catch (liveError) {
                    console.error('[LIVE EXECUTION ERROR]', liveError);
                    return {
                        executed: false,
                        mode: 'LIVE',
                        side: type,
                        message: `Live execution failed: ${liveError.message}`
                    };
                }
            }
        }

        return { executed: false, mode: isDryRun ? 'DRY_RUN' : 'LIVE', message: `Unknown action type: ${type}` };

    } catch (error) {
        console.error('Error in executeAction:', error);
        throw error;
    }
}
