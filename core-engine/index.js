import { loadState } from './memory-manager.js';
import { checkConnectionAndBalance } from './exchange.js';
import { askPythonBrain } from './api-bridge.js';
import { sendAlert } from './hermes.js';

async function main() {
    const startMsg = 'Starting Lexbon AI Bot - Phase 1 with Hermes...';
    console.log(startMsg);
    await sendAlert(`🚀 ${startMsg}\nSystem Booting...`);

    try {
        // 1. Load state from memory manager
        console.log('Loading memory state...');
        const stateData = loadState();
        console.log(`Current morning briefing: "${stateData.morning_briefing}"`);

        // 2. Get Binance Testnet Balance
        let balance = 0;
        try {
            balance = await checkConnectionAndBalance();
            await sendAlert(`✅ Connected to Binance Mainnet (REAL).\n💰 Current USDT Balance: ${balance}`);
        } catch (error) {
            console.warn('Warning: Could not fetch balance. Check your .env file or real API keys.');
            await sendAlert(`⚠️ Failed to connect to Binance Mainnet or fetch balance. Check logs.`);
            console.warn('Continuing without valid balance for testing purposes...');
        }

        // 3. Construct payload
        const payload = {
            market: 'BTC/USDT',
            action: 'test_phase_1',
            balance: balance,
            memory_state: stateData
        };

        // 4. Send payload to askPythonBrain
        console.log('Sending payload to Python AI Brain...');
        const aiResponse = await askPythonBrain(payload);

        // 5. Log the AI's response
        console.log('\n--- AI Brain Response ---');
        console.log(JSON.stringify(aiResponse, null, 2));
        console.log('-------------------------\n');
        
        await sendAlert(`🧠 AI Brain Response Received:\nStatus: ${aiResponse.status}\nBriefing: ${aiResponse.morning_briefing}\nAction: ${aiResponse.action?.type || 'Unknown'}`);
        
        console.log('Phase 1 Scaffolding test completed successfully.');
    } catch (error) {
        console.error('Fatal error in main application loop:', error);
        await sendAlert(`❌ Fatal Error in Core Engine:\n${error.message}`);
    }
}

// Execute main function
main();
