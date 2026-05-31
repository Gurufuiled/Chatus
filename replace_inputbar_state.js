const fs = require('fs');

const target = 'mobile/src/components/InputBar.tsx';
let content = fs.readFileSync(target, 'utf8');

const search2 = `  const [stickerSheetVisible, setStickerSheetVisible] = useState(false);
  const [stickerSheetBootTab, setStickerSheetBootTab] = useState<StickerPanelTopTab | null>(null);`;

const replace2 = `  const [stickerSheetVisible, setStickerSheetVisible] = useState(false);
  const [stickerSheetBootTab, setStickerSheetBootTab] = useState<StickerPanelTopTab | null>(null);
  const [showChannelSelector, setShowChannelSelector] = useState(false);`;

if (content.includes(search2)) {
  content = content.replace(search2, replace2);
  fs.writeFileSync(target, content, 'utf8');
  console.log('Successfully added showChannelSelector state');
} else {
  console.log('Search block not found for state');
}
