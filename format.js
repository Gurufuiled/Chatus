const fs = require('fs');
const testPath = 'mobile/src/navigation/TelegramBottomTabBar.tsx';
let testContent = fs.readFileSync(testPath, 'utf8');

testContent = testContent.replace(/"/g, "'");
fs.writeFileSync(testPath, testContent);
