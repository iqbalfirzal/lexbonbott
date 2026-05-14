import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatId = process.env.TELEGRAM_CHAT_ID;

let bot = null;

if (token && allowedChatId && token !== 'your_telegram_bot_token_here') {
    bot = new TelegramBot(token, { polling: true });

    // Middleware to check chat ID for security
    const isValidChat = (msg) => {
        return msg.chat.id.toString() === allowedChatId;
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

    console.log('Hermes (Telegram Bot) initialized successfully.');
} else {
    console.warn('Telegram credentials missing or default in .env. Hermes is disabled.');
}

export async function sendAlert(message) {
    if (bot && allowedChatId) {
        try {
            await bot.sendMessage(allowedChatId, message);
        } catch (error) {
            console.error('Failed to send Telegram alert:', error.message);
        }
    } else {
        // Fallback to console if telegram is disabled
        console.log(`[Hermes Disabled] Alert: ${message}`);
    }
}

export default bot;
