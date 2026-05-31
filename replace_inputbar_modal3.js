const fs = require('fs');

const target = 'mobile/src/components/InputBar.tsx';
let content = fs.readFileSync(target, 'utf8');

const search = `      {onSendVideoNote != null && (
        <VideoNoteRecorder
          visible={showVideoNoteRecorder}
          onComplete={handleVideoNoteComplete}
          onCancel={handleVideoNoteCancel}
          blurTargetRef={blurTargetRef}
        />
      )}

    </>
  );
}

function createInputBarStyles(themeColors: ThemeColors) {`;

const replace = `      {onSendVideoNote != null && (
        <VideoNoteRecorder
          visible={showVideoNoteRecorder}
          onComplete={handleVideoNoteComplete}
          onCancel={handleVideoNoteCancel}
          blurTargetRef={blurTargetRef}
        />
      )}

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

function createInputBarStyles(themeColors: ThemeColors) {`;

if (content.includes(search)) {
  content = content.replace(search, replace);
  fs.writeFileSync(target, content, 'utf8');
  console.log('Successfully added SendChannelSelector to render');
} else {
  console.log('Search block not found for render');
}
