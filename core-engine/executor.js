import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadState, saveState } from './memory-manager.js';
import { exchangeInstance, withRetry } from './exchange.js';

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
            const positionSize = allocationUsdt / currentPrice;
            
            let stopLossPrice, takeProfitPrice;

            // Strict Risk Parameters: SL -2%, TP +1.5% for BUY. Reverse for SELL.
            if (type === 'BUY') {
                stopLossPrice = currentPrice * 0.98; // -2%
                takeProfitPrice = currentPrice * 1.015; // +1.5%
            } else { // SELL
                stopLossPrice = currentPrice * 1.02; // +2%
                takeProfitPrice = currentPrice * 0.985; // -1.5%
            }

            if (isDryRun) {
                console.log(`[DRY RUN] Simulating ${type} order for ${action.market}`);
                
                const state = loadState();
                if (!state.active_virtual_trades) state.active_virtual_trades = [];
                state.active_virtual_trades.push({
                    symbol: action.market,
                    side: type,
                    entry_price: currentPrice,
                    size: positionSize,
                    sl: stopLossPrice,
                    tp: takeProfitPrice,
                    timestamp: Date.now()
                });
                saveState(state);

                return {
                    executed: true,
                    mode: 'DRY_RUN',
                    side: type,
                    size: positionSize,
                    entry: currentPrice,
                    sl: stopLossPrice,
                    tp: takeProfitPrice,
                    message: `Simulated ${type} successfully.`
                };
            } else {
                console.log(`[LIVE] Executing ${type} order for ${action.market} with leverage ${leverage}x`);
                
                try {
                    // 1. Set Margin Mode
                    try {
                        await withRetry(() => exchangeInstance.setMarginMode(marginMode, action.market));
                    } catch (e) {
                        if (e.message && (e.message.includes('MarginModeAlreadySet') || e.message.includes('No need to change'))) {
                            // Safe to ignore
                        } else {
                            console.warn(`Could not set margin mode for ${action.market}:`, e.message);
                        }
                    }

                    // 2. Set Leverage
                    try {
                        await withRetry(() => exchangeInstance.setLeverage(leverage, action.market));
                    } catch (e) {
                        console.warn(`Could not set leverage for ${action.market}:`, e.message);
                    }

                    // 3. Position Size with Leverage
                    const leveragedAllocation = allocationUsdt * leverage;
                    const rawSize = leveragedAllocation / currentPrice;
                    const formattedSize = exchangeInstance.amountToPrecision(action.market, rawSize);
                    
                    const side = type.toLowerCase();
                    const inverseSide = side === 'buy' ? 'sell' : 'buy';

                    // 4. Entry Order
                    console.log(`Placing entry MARKET order: ${side} ${formattedSize} ${action.market}`);
                    const entryOrder = await withRetry(() => exchangeInstance.createMarketOrder(action.market, side, formattedSize));

                    // 5. SL and TP Orders
                    const slFormattedPrice = exchangeInstance.priceToPrecision(action.market, stopLossPrice);
                    const tpFormattedPrice = exchangeInstance.priceToPrecision(action.market, takeProfitPrice);

                    console.log(`Placing SL STOP_MARKET order at ${slFormattedPrice}`);
                    await withRetry(() => exchangeInstance.createOrder(action.market, 'STOP_MARKET', inverseSide, formattedSize, undefined, {
                        stopPrice: slFormattedPrice,
                        reduceOnly: true,
                        workingType: 'MARK_PRICE'
                    }));

                    console.log(`Placing TP TAKE_PROFIT_MARKET order at ${tpFormattedPrice}`);
                    await withRetry(() => exchangeInstance.createOrder(action.market, 'TAKE_PROFIT_MARKET', inverseSide, formattedSize, undefined, {
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
