import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadState, saveState } from './memory-manager.js';
import { sendAlert } from './hermes.js';
import { exchangeInstance, withRetry } from './exchange.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const isDryRun = process.env.DRY_RUN === 'true';

export async function manageOpenPositions() {
    try {
        if (isDryRun) {
            const state = loadState();
            let virtualTrades = state.active_virtual_trades || [];
            
            if (virtualTrades.length === 0) {
                return; // No active trades
            }

            let stateUpdated = false;

            for (let i = 0; i < virtualTrades.length; i++) {
                let trade = virtualTrades[i];
                
                // Fetch current ticker price
                const ticker = await withRetry(() => exchangeInstance.fetchTicker(trade.symbol));
                const currentPrice = ticker.last;

                // Calculate PnL percentage
                let pnlPercent = 0;
                if (trade.side === 'BUY') {
                    pnlPercent = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
                } else if (trade.side === 'SELL') {
                    pnlPercent = ((trade.entry_price - currentPrice) / trade.entry_price) * 100;
                }

                // Phase 7 logic: If PnL > 1.5%, shift Stop Loss to Breakeven (Entry Price)
                if (pnlPercent >= 1.5 && trade.sl !== trade.entry_price) {
                    trade.sl = trade.entry_price; // Move to breakeven
                    stateUpdated = true;
                    
                    const msg = `🛡️ <b>[DRY RUN] Position Management</b>\n` +
                                `Symbol: ${trade.symbol}\n` +
                                `Current PnL: +${pnlPercent.toFixed(2)}%\n` +
                                `Action: Shifted SL to Breakeven (${trade.entry_price})`;
                    console.log(msg.replace(/<[^>]*>?/gm, ''));
                    await sendAlert(msg, { parse_mode: 'HTML' });
                }
            }

            if (stateUpdated) {
                state.active_virtual_trades = virtualTrades;
                saveState(state);
            }
            
        } else {
            // Live Mode via CCXT
            const positions = await withRetry(() => exchangeInstance.fetchPositions());
            const activePositions = positions.filter(p => p.contracts > 0);

            if (activePositions.length === 0) return;

            for (let position of activePositions) {
                const symbol = position.symbol;
                const pnlPercent = position.percentage;

                if (pnlPercent >= 1.5) {
                    const msg = `🛡️ <b>[LIVE] Position Management</b>\nSymbol: ${symbol} is +${pnlPercent}%. Trailing SL logic triggered.`;
                    console.log(msg.replace(/<[^>]*>?/gm, ''));
                    await sendAlert(msg, { parse_mode: 'HTML' });
                    // Cancel old SL and create new SL at entry price
                }
            }
        }
    } catch (error) {
        console.error('Error in manageOpenPositions:', error);
        await sendAlert(`❌ Error in Position Management Loop:\n${error.message}`);
    }
}
