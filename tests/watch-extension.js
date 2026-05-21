#!/usr/bin/env node

/**
 * Development helper: Watches extension files and displays reload instructions
 */

const fs = require('fs');
const path = require('path');

const EXTENSION_PATH = path.join(__dirname, '..', 'static', 'extension');
const WATCH_FILES = ['content.js', 'background.js', 'popup.js', 'popup.html', 'manifest.json'];

console.log('\n👀 Watching extension files for changes...\n');
console.log('Watching:', WATCH_FILES.join(', '));
console.log('\nWhen files change:');
console.log('  1. Go to chrome://extensions');
console.log('  2. Click the reload icon for "Resume RAG Form Filler"');
console.log('  3. Refresh the job application page\n');
console.log('Press Ctrl+C to stop\n');

let changeTimeout = null;

WATCH_FILES.forEach(filename => {
    const filepath = path.join(EXTENSION_PATH, filename);

    fs.watch(filepath, (eventType) => {
        if (eventType === 'change') {
            // Debounce multiple rapid changes
            clearTimeout(changeTimeout);
            changeTimeout = setTimeout(() => {
                const timestamp = new Date().toLocaleTimeString();
                console.log(`\n🔄 [${timestamp}] ${filename} changed - RELOAD EXTENSION!`);
                console.log('   chrome://extensions → Click reload icon\n');
            }, 100);
        }
    });
});

// Keep process running
process.stdin.resume();
