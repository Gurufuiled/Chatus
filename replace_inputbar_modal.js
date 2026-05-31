const fs = require('fs');

const target = 'mobile/src/components/InputBar.tsx';
let content = fs.readFileSync(target, 'utf8');

const search = `      <StickerPackSheet
        visible={stickerSheetVisible}
        onClose={() => setStickerSheetVisible(false)}
        bootTab={stickerSheetBootTab}
        onSelectFriendSticker={handleInsertFriendSticker}
        onSelectSoloSticker={handleSoloStickerSend}
      />
    </>
  );
}

const VOICE_BUBBLE_SLIDE_DURATION = 200;`;

const replace = `      <StickerPackSheet
        visible={stickerSheetVisible}
        onClose={() => setStickerSheetVisible(false)}
        bootTab={stickerSheetBootTab}
        onSelectFriendSticker={handleInsertFriendSticker}
        onSelectSoloSticker={handleSoloStickerSend}
      />

      {onSendChannelChange && (
        <SendChannelSelector
          visible={showChannelSelector}
          currentChannel={sendChannel}
          onSelect={onSendChannelChange}
          onDismiss={() => setShowChannelSelector(false)}
          telegramAvailable={telegramAvailable}
        />
      )}
    </>
  );
}

const VOICE_BUBBLE_SLIDE_DURATION = 200;`;

if (content.includes(search)) {
  content = content.replace(search, replace);
  fs.writeFileSync(target, content, 'utf8');
  console.log('Successfully added SendChannelSelector to render');
} else {
  console.log('Search block not found for render');
}

const searchImport = `import { StickerPackSheet } from './StickerPackSheet';`;
const replaceImport = `import { StickerPackSheet } from './StickerPackSheet';
import { SendChannelSelector } from './SendChannelSelector';`;

if (content.includes(searchImport)) {
  content = content.replace(searchImport, replaceImport);
  fs.writeFileSync(target, content, 'utf8');
  console.log('Successfully added import for SendChannelSelector');
} else {
  console.log('Search block not found for import');
}
