const fs = require('fs');
const path = require('path');

const files = [
    'web/src/models/SmartAllocationResolver.js',
    'web/src/services/SynchronousClassValidator.js',
    'web/src/services/SynchronousScheduler.js',
    'web/src/services/scheduleService.js',
    'web/src/services/DataMigration.js',
    'web/src/services/smartRepairService.js'
];

files.forEach(file => {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
        console.log(`Processing ${file}...`);
        let content = fs.readFileSync(fullPath, 'utf8');

        // Split by lines
        const lines = content.split(/\r?\n/);
        const newLines = lines.filter(line => {
            const trimmed = line.trim();
            // Remove lines that start with console.log, allowing for indentation
            // Check for specific console.log
            if (trimmed.startsWith('console.log(') || trimmed.startsWith('console.log (')) {
                return false;
            }
            return true;
        });

        const newContent = newLines.join('\n');

        if (newContent !== content) {
            fs.writeFileSync(fullPath, newContent, 'utf8');
            console.log(`✅ Cleaned ${file}`);
        } else {
            console.log(`⚠️ No changes for ${file}`);
        }
    } else {
        console.log(`❌ File not found: ${file}`);
    }
});
