import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadState } from './memory-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const token = process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_TOKEN.trim() : null;
const allowedChatId = process.env.TELEGRAM_CHAT_ID ? process.env.TELEGRAM_CHAT_ID.trim() : null;

let bot = null;

if (token && allowedChatId && token !== 'your_telegram_bot_token_here') {
    bot = new TelegramBot(token, { polling: true });

    // Hapus webhook lama (jika ada) yang nyangkut dan memblokir sistem polling
    bot.deleteWebHook().catch(err => console.error('Failed to clear webhook:', err));

    bot.on('polling_error', (error) => {
        console.error(`[Hermes Polling Error] Code: ${error.code}, Msg: ${error.message}`);
    });

    // Middleware to check chat ID for security
    const isValidChat = (msg) => {
        const incomingId = msg.chat.id.toString();
        if (incomingId === allowedChatId) {
            return true;
        } else {
            console.warn(`[Hermes Security] Ignored command from unauthorized chat ID: '${incomingId}'. Expected: '${allowedChatId}'`);
            return false;
        }
    };

    bot.onText(/\/ping/, (msg) => {
        if (!isValidChat(msg)) return;
        bot.sendMessage(allowedChatId, 'Pong! Hermes is online.');
    });

    bot.onText(/\/status/, (msg) => {
        if (!isValidChat(msg)) return;
        bot.sendMessage(allowedChatId, 'Status: Core Engine running. Phase 1 active.');
    });

    bot.onText(/\/pause/, (msg) => {
        if (!isValidChat(msg)) return;
        bot.sendMessage(allowedChatId, 'Pause command received. (Not fully implemented in Phase 1 yet).');
    });

    bot.onText(/\/briefing/, (msg) => {
        if (!isValidChat(msg)) return;
        const state = loadState();
        bot.sendMessage(allowedChatId, `📰 <b>Morning Briefing</b>:\n${state.morning_briefing || 'No briefing available.'}`, { parse_mode: 'HTML' });
    });

    bot.onText(/\/thresholds/, (msg) => {
        if (!isValidChat(msg)) return;
        const dryRun = process.env.DRY_RUN || 'true';
        const alloc = process.env.TRADE_ALLOCATION_USDT || '15';
        const interval = process.env.SCREENING_INTERVAL_MS || '900000';
        
        bot.sendMessage(allowedChatId, `⚙️ <b>Current Thresholds & Config</b>:\n` +
            `<b>DRY_RUN</b>: ${dryRun}\n` +
            `<b>Allocation</b>: ${alloc} USDT\n` +
            `<b>Interval</b>: ${interval} ms (${parseInt(interval)/60000} mins)`, { parse_mode: 'HTML' });
    });

    bot.onText(/\/evolve/, (msg) => {
        if (!isValidChat(msg)) return;
        const state = loadState();
        const lessons = state.pinned_lessons || [];
        const lessonsText = lessons.map(l => `- ${l}`).join('\n\n');
        bot.sendMessage(allowedChatId, `🧬 <b>Evolution Request Denied</b>.\n\nCore directives (Admin Locks) are immutable:\n\n${lessonsText}`, { parse_mode: 'HTML' });
    });

    bot.on('message', (msg) => {
        console.log(`[Hermes Debug] Received message from: ${msg.chat.id}, text: ${msg.text}`);
    });

    console.log('Hermes (Telegram Bot) initialized successfully. Polling is ACTIVE.');
} else {
    console.warn('Telegram credentials missing or default in .env. Hermes is disabled.');
}

export async function sendAlert(message, options = { parse_mode: 'HTML' }) {
    if (bot && allowedChatId) {
        try {
            await bot.sendMessage(allowedChatId, message, options);
        } catch (error) {
            console.error('Failed to send Telegram alert:', error.message);
        }
    } else {
        // Fallback to console if telegram is disabled
        console.log(`[Hermes Disabled] Alert: ${message}`);
    }
}

export default bot;
