const fs = require('fs');

const target = 'mobile/src/components/InputBar.tsx';
let content = fs.readFileSync(target, 'utf8');

const searchImport = `import { SendChannelSelector } from './SendChannelSelector';`;
const replaceImport = `import { SendChannelSelector } from './SendChannelSelector';
import { PlatformSourceIcon } from './PlatformSourceIcon';`;

if (content.includes(searchImport)) {
  content = content.replace(searchImport, replaceImport);
  fs.writeFileSync(target, content, 'utf8');
  console.log('Successfully added import for PlatformSourceIcon');
} else {
  console.log('Search block not found for import');
}
