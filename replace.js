const fs = require('fs');
let content = fs.readFileSync('app/request/page.tsx', 'utf8');

// Replace focus:bg-[#E8601C]
content = content.replace(/focus:bg-\[#E8601C\]/g, 'focus:bg-blue-600 dark:focus:bg-[#E8601C]');

// Replace focus:ring-[#E8601C]
content = content.replace(/focus:ring-\[#E8601C\]/g, 'focus:ring-blue-600 dark:focus:ring-[#E8601C]');

// Replace focus:border-[#E8601C]
content = content.replace(/focus:border-\[#E8601C\]/g, 'focus:border-blue-600 dark:focus:border-[#E8601C]');

fs.writeFileSync('app/request/page.tsx', content, 'utf8');
console.log('Done!');
