import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const stateFilePath = path.join(__dirname, '../memory/state.json');

export function loadState() {
    try {
        if (!fs.existsSync(stateFilePath)) {
            console.warn('state.json not found. Returning empty state.');
            return {};
        }
        const data = fs.readFileSync(stateFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading memory state:', error);
        return {};
    }
}

export function updateState(updates) {
    try {
        const currentState = loadState();
        
        // Merge updates with current state
        const newState = { ...currentState };
        
        for (const key in updates) {
            if (updates[key] && typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
                newState[key] = { ...currentState[key], ...updates[key] };
            } else {
                newState[key] = updates[key];
            }
        }
        
        // Write synchronously to prevent race conditions during reads/writes
        fs.writeFileSync(stateFilePath, JSON.stringify(newState, null, 2), 'utf8');
        return newState;
    } catch (error) {
        console.error('Error updating memory state:', error);
        return null;
    }
}

export function saveState(state) {
    try {
        fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving memory state:', error);
        return false;
    }
}
