import { loadState } from './memory-manager.js';
import { checkConnectionAndBalance, fetchMarketRadar } from './exchange.js';
import { askPythonBrain } from './api-bridge.js';
import { sendAlert } from './hermes.js';
import { executeAction } from './executor.js';
import { manageOpenPositions } from './manager.js';

const INTERVAL_MS = parseInt(process.env.SCREENING_INTERVAL_MS || '900000', 10);
const MGT_INTERVAL_MS = parseInt(process.env.MANAGEMENT_INTERVAL_MS || '180000', 10);

const initMsg = `Initiating infinite trading loop. Cycle: Every ${INTERVAL_MS / 60000} minutes.`;
const mgtMsg = `Initiating secondary loop: Position Management (Every ${MGT_INTERVAL_MS / 60000} mins).`;

console.log(initMsg);
console.log(mgtMsg);

// Try to send initial boot alert, but don't block execution if it fails
sendAlert(`🚀 ${initMsg}\n${mgtMsg}\nSystem Booting...`).catch(err => console.error("Initial alert failed:", err));

async function runTradingCycle() {
    console.log('\n--- Starting New Trading Cycle ---');

    try {
        // 1. Load state from memory manager
        console.log('Loading memory state...');
        const stateData = loadState();
        console.log(`Current morning briefing: "${stateData.morning_briefing}"`);

        // 2. Get Binance Mainnet Balance
        let balance = 0;
        try {
            balance = await checkConnectionAndBalance();
            await sendAlert(`✅ Connected to Binance Mainnet (REAL).\n💰 Current USDT Balance: ${balance}`);
        } catch (error) {
            console.warn('Warning: Could not fetch balance. Check your .env file or real API keys.');
            await sendAlert(`⚠️ Failed to connect to Binance Mainnet or fetch balance. Check logs.`);
            console.warn('Continuing without valid balance for testing purposes...');
        }

        // 3. Phase 8 Multi-Pair Implementation
        let targetPairs = [];
        try {
            targetPairs = JSON.parse(process.env.TARGET_PAIRS || '["SOLUSDT"]');
        } catch (e) {
            console.warn('Failed to parse TARGET_PAIRS, defaulting to SOLUSDT');
            targetPairs = ["SOLUSDT"];
        }

        for (const rawSymbol of targetPairs) {
            const targetSymbol = rawSymbol.replace('USDT', '/USDT');
            console.log(`\n--- Processing Pair: ${targetSymbol} ---`);

            try {
                const marketRadar = await fetchMarketRadar(targetSymbol);
                const summaryMsg = `📡 Fetched 20 candles and order book for ${targetSymbol}`;
                console.log(summaryMsg);

                // 4. Construct payload
                const payload = {
                    market_data: marketRadar,
                    action: 'analyze_radar',
                    balance: balance,
                    memory_state: stateData
                };

                // 5. Send payload to askPythonBrain
                console.log(`Sending payload to Python AI Brain for ${targetSymbol}...`);
                const aiResponse = await askPythonBrain(payload);

                console.log(`\n--- AI Brain Response [${targetSymbol}] ---`);
                console.log(JSON.stringify(aiResponse, null, 2));
                console.log('-------------------------\n');
                
                await sendAlert(`🧠 AI Response [${targetSymbol}]:\nStatus: ${aiResponse.status}\nBriefing: ${aiResponse.morning_briefing}\nAction: ${aiResponse.action?.type || 'Unknown'}`);
                
                // 6. Phase 4 Execution
                if (aiResponse.action && aiResponse.action.type) {
                    const actionType = aiResponse.action.type.toUpperCase();
                    
                    if (actionType !== 'STANDBY') {
                        const lastCandle = marketRadar.ohlcv[marketRadar.ohlcv.length - 1];
                        const currentPrice = lastCandle[4]; // Close price
                        
                        console.log(`Executing ${actionType} action at price ${currentPrice}...`);
                        const execResult = await executeAction(aiResponse.action, currentPrice);
                        
                        if (execResult.executed) {
                            await sendAlert(`⚡ EXECUTION: ${execResult.mode} ⚡\nSymbol: ${targetSymbol}\nSide: ${execResult.side}\nEntry: ${execResult.entry}\nSize: ${execResult.size.toFixed(4)}\nStop Loss: ${execResult.sl.toFixed(4)}\nTake Profit: ${execResult.tp.toFixed(4)}`);
                        } else {
                            await sendAlert(`⚠️ EXECUTION FAILED / SKIPPED [${targetSymbol}] ⚠️\nReason: ${execResult.message}`);
                        }
                    } else {
                        console.log(`Action is STANDBY for ${targetSymbol}. No execution required.`);
                    }
                }
            } catch (pairError) {
                console.error(`Error processing pair ${targetSymbol}:`, pairError);
                await sendAlert(`⚠️ Error processing ${targetSymbol}: ${pairError.message}`);
            }

            // Sleep 2 seconds between pairs to respect CCXT rate limits
            console.log(`Sleeping 2 seconds before next pair...`);
            await new Promise(r => setTimeout(r, 2000));
        }
        
        console.log('Trading cycle execution completed.');
    } catch (error) {
        console.error('Fatal error in trading cycle:', error);
        await sendAlert(`❌ Fatal Error in Trading Cycle:\n${error.message}`);
    }
}

// Start immediately
runTradingCycle();
manageOpenPositions();

// Set up infinite loops
setInterval(runTradingCycle, INTERVAL_MS);
setInterval(manageOpenPositions, MGT_INTERVAL_MS);
