const fs = require('fs');

const target = 'mobile/src/components/InputBar.tsx';
let content = fs.readFileSync(target, 'utf8');

const search = `                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Отправить"
                  style={({ pressed }) => [styles.trailingAction, pressed && styles.trailingActionPressed]}
                  onPress={handleSend}
                >
                  <SendIcon />
                </Pressable>`;

const replace = `                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Отправить"
                  style={({ pressed }) => [styles.trailingAction, pressed && styles.trailingActionPressed]}
                  onPress={handleSend}
                  onLongPress={() => {
                    if (onSendChannelChange) {
                      setShowChannelSelector(true);
                    }
                  }}
                >
                  <SendIcon />
                </Pressable>`;

if (content.includes(search)) {
  content = content.replace(search, replace);
  fs.writeFileSync(target, content, 'utf8');
  console.log('Successfully replaced Send button long press');
} else {
  console.log('Search block not found for Send button');
}

const search2 = `  const [stickerSheetVisible, setStickerSheetVisible] = useState(false);
  const [activeStickerTab, setActiveStickerTab] = useState<StickerPanelTopTab>('recent');`;

const replace2 = `  const [stickerSheetVisible, setStickerSheetVisible] = useState(false);
  const [activeStickerTab, setActiveStickerTab] = useState<StickerPanelTopTab>('recent');
  const [showChannelSelector, setShowChannelSelector] = useState(false);`;

if (content.includes(search2)) {
  content = content.replace(search2, replace2);
  fs.writeFileSync(target, content, 'utf8');
  console.log('Successfully added showChannelSelector state');
} else {
  console.log('Search block not found for state');
}
