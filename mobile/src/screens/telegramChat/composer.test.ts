import assert from 'node:assert/strict';

import {
  buildInputMessageDocumentContent,
  buildInputMessagePhotoContent,
  buildInputMessageVideoContent,
  buildInputMessageVideoNoteContent,
  buildInputMessageVoiceNoteContent,
} from './composer';

const localFile = (path: string) => ({ '@type': 'inputFileLocal', path });

assert.deepEqual(
  buildInputMessageVoiceNoteContent({
    voiceUri: 'file:///tmp/voice.m4a',
    durationMs: 1_600,
  }),
  {
    '@type': 'inputMessageVoiceNote',
    voice_note: {
      '@type': 'inputVoiceNote',
      voice_note: localFile('/tmp/voice.m4a'),
      duration: 2,
      waveform: '',
    },
    caption: { '@type': 'formattedText', text: '', entities: [] },
    self_destruct_type: null,
  },
);

assert.deepEqual(
  buildInputMessageVideoNoteContent({
    videoUri: 'file:///tmp/note.mp4',
    thumbnailUri: 'file:///tmp/note.jpg',
    durationMs: 2_400,
    lengthPx: 480,
  }),
  {
    '@type': 'inputMessageVideoNote',
    video_note: {
      '@type': 'inputVideoNote',
      video_note: localFile('/tmp/note.mp4'),
      thumbnail: {
        '@type': 'inputThumbnail',
        thumbnail: localFile('/tmp/note.jpg'),
        width: 480,
        height: 480,
      },
      duration: 2,
      length: 480,
    },
    self_destruct_type: null,
  },
);

const video = buildInputMessageVideoContent({
  videoUri: 'file:///tmp/video.mp4',
  durationMs: 3_000,
  width: 720,
  height: 1_280,
});
assert.equal((video.video as Record<string, unknown>)['@type'], 'inputVideo');
assert.deepEqual((video.video as Record<string, unknown>).video, localFile('/tmp/video.mp4'));

const photo = buildInputMessagePhotoContent({
  photoUri: 'file:///tmp/photo.jpg',
  width: 800,
  height: 600,
});
assert.equal((photo.photo as Record<string, unknown>)['@type'], 'inputPhoto');
assert.deepEqual((photo.photo as Record<string, unknown>).photo, localFile('/tmp/photo.jpg'));

const document = buildInputMessageDocumentContent({
  documentUri: 'file:///tmp/file.pdf',
});
assert.equal((document.document as Record<string, unknown>)['@type'], 'inputDocument');
assert.deepEqual(
  (document.document as Record<string, unknown>).document,
  localFile('/tmp/file.pdf'),
);

console.log('composer TDLib 1.8.66 payload tests: OK');
