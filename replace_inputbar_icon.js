const fs = require('fs');

const target = 'mobile/src/components/InputBar.tsx';
let content = fs.readFileSync(target, 'utf8');

const search = `                <Pressable
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
                  {onSendChannelChange && sendChannel === 'telegram' ? (
                    <PlatformSourceIcon source="telegram" size={20} />
                  ) : onSendChannelChange && sendChannel === 'chatus' ? (
                    <PlatformSourceIcon source="chatus" size={20} />
                  ) : (
                    <SendIcon />
                  )}
                </Pressable>`;

if (content.includes(search)) {
  content = content.replace(search, replace);
  fs.writeFileSync(target, content, 'utf8');
  console.log('Successfully updated icon on send button');
} else {
  console.log('Search block not found for send button');
}
