const fs = require('fs');

const target = 'mobile/src/components/InputBar.tsx';
let content = fs.readFileSync(target, 'utf8');

const search = `      <InputAttachmentSheet
        visible={showAttachmentSheet}
        galleryEnabled={onSendMedia != null}
        galleryItems={galleryItems}
        galleryLoading={galleryLoading}
        galleryDenied={galleryDenied}
        onGalleryRequestPermission={handleGalleryRequestPermission}
        onClose={handleAttachmentClose}
        onSelectMedia={handleAttachmentSelectMedia}
        onSelectFile={handleAttachmentSelectFile}
        onSendDirectAlbum={handleAttachmentSendAlbum}
      />
    </>
  );
}

const VOICE_BUBBLE_SLIDE_DURATION = 200;`;

const replace = `      <InputAttachmentSheet
        visible={showAttachmentSheet}
        galleryEnabled={onSendMedia != null}
        galleryItems={galleryItems}
        galleryLoading={galleryLoading}
        galleryDenied={galleryDenied}
        onGalleryRequestPermission={handleGalleryRequestPermission}
        onClose={handleAttachmentClose}
        onSelectMedia={handleAttachmentSelectMedia}
        onSelectFile={handleAttachmentSelectFile}
        onSendDirectAlbum={handleAttachmentSendAlbum}
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
