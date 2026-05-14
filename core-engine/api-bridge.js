import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pythonScriptPath = path.join(__dirname, '../ai-brain/analyzer.py');

export function askPythonBrain(payload) {
    return new Promise((resolve, reject) => {
        // Spawn the python process. 'python' is typical for Windows, 'python3' for Unix.
        // We use 'python' as per general Windows environments, but might need adjustment based on python setup.
        const pythonProcess = spawn('python3', [pythonScriptPath]);

        let outputData = '';
        let errorData = '';

        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`Python process exited with code ${code}`);
                console.error(`stderr: ${errorData}`);
                return reject(new Error(`Python script failed: ${errorData}`));
            }

            try {
                // Parse the JSON output from stdout
                const result = JSON.parse(outputData);
                resolve(result);
            } catch (err) {
                console.error('Failed to parse Python output:', outputData);
                reject(err);
            }
        });

        // Send payload to Python via stdin
        pythonProcess.stdin.write(JSON.stringify(payload));
        pythonProcess.stdin.end();
    });
}
