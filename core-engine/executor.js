import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadState, saveState } from './memory-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const isDryRun = process.env.DRY_RUN === 'true';
const allocationUsdt = parseFloat(process.env.TRADE_ALLOCATION_USDT || '15');

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
                // Future Phase: Implement real CCXT execution logic here
                console.warn(`[LIVE WARNING] Live execution not yet implemented. Bypassing.`);
                return {
                    executed: false,
                    mode: 'LIVE',
                    side: type,
                    message: 'Live execution not fully implemented yet in Phase 4.'
                };
            }
        }

        return { executed: false, mode: isDryRun ? 'DRY_RUN' : 'LIVE', message: `Unknown action type: ${type}` };

    } catch (error) {
        console.error('Error in executeAction:', error);
        throw error;
    }
}
