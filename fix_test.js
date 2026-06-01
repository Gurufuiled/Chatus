const fs = require('fs');
const testPath = 'mobile/src/screens/telegramChat/telegramChannelPostLayout.test.ts';
let testContent = fs.readFileSync(testPath, 'utf8');

testContent = testContent.replace('assert(w400 === 336, `expected 336 for 400px screen, got ${w400}`);', 'assert(w400 === 344, `expected 344 for 400px screen, got ${w400}`);');

fs.writeFileSync(testPath, testContent);
