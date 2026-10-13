/**
 * Тесты загрузки медиа в Telegram-чате: какие файлы TDLib качает при маппинге сообщений и с каким приоритетом.
 * Запуск: npx jest src/screens/telegramChat/tdlibMapping.media.test.tsx
 */
import {
  mapTdMessage,
  cancelTdlibFileDownload,
  scheduleTdlibFileDownload,
  DEFAULT_MAP_DOWNLOAD_PRIORITY,
} from './tdlibMapping';
import { fetchTelegramHistoryBatch, PRELOAD_DOWNLOAD_PRIORITY } from './telegramChatHistoryFetch';
import {
  collectPendingTdlibVideoFileIds,
  completedTdlibFileIds,
  patchMessagesWithTdlibFile,
  patchMessagesWithTdlibFiles,
} from './telegramFileUpdates';
import type { TelegramMessageRow } from './types';

const mockSend = jest.fn((_request: Record<string, unknown>) => Promise.resolve({}));
jest.mock('../../services/tdlib/TdlibClient', () => ({
  tdlibClient: {
    send: (request: Record<string, unknown>) => mockSend(request),
    subscribe: jest.fn(),
  },
}));
jest.mock('../../services/tdlib/tdlibBootstrap', () => ({
  applyTdlibParameters: jest.fn(() => Promise.resolve()),
  waitForTdlibAuthorizationReady: jest.fn(() => Promise.resolve({ ready: true })),
}));

/* ───────────── сборщики сырых сообщений TDLib ───────────── */

const tdFile = (id: number, localPath?: string) => ({
  id,
  size: 1000,
  local: { path: localPath ?? '', is_downloading_completed: Boolean(localPath) },
});

type Size = [width: number, height: number, fileId: number, local?: string];

const photoMessage = (messageId: number, sizes: Size[]) => ({
  id: messageId,
  date: 1_700_000_000 + messageId,
  is_outgoing: true,
  content: {
    '@type': 'messagePhoto',
    caption: { text: '' },
    photo: {
      minithumbnail: { data: 'AAAAAAAAAAAA' },
      sizes: sizes.map(([width, height, id, local]) => ({
        type: 'x',
        width,
        height,
        photo: tdFile(id, local),
      })),
    },
  },
});

const voiceMessage = (messageId: number, fileId: number, local?: string) => ({
  id: messageId,
  date: 1_700_000_000 + messageId,
  is_outgoing: true,
  content: {
    '@type': 'messageVoiceNote',
    voice_note: { duration: 5, waveform: '', voice: tdFile(fileId, local) },
  },
});

const documentMessage = (messageId: number, fileId: number, local?: string) => ({
  id: messageId,
  date: 1_700_000_000 + messageId,
  is_outgoing: true,
  content: {
    '@type': 'messageDocument',
    caption: { text: '' },
    document: { file_name: 'report.pdf', document: tdFile(fileId, local) },
  },
});

const downloads = () =>
  mockSend.mock.calls
    .map((call) => call[0])
    .filter((req) => req['@type'] === 'downloadFile')
    .map((req) => ({ fileId: req.file_id as number, priority: req.priority as number }));

// у каждого теста свои id файлов: очередь загрузок в модуле помнит уже поставленные
let nextFile = 100;
const ids = (count: number) => Array.from({ length: count }, () => (nextFile += 1));

beforeEach(() => {
  mockSend.mockClear();
  mockSend.mockImplementation((request) => {
    if (request['@type'] === 'getChat') return Promise.resolve({ last_read_outbox_message_id: 0 });
    return Promise.resolve({});
  });
});

/* ───────────── фото ───────────── */

describe('фото: какой размер качаем (регрессия: качался оригинал 2560 для каждого фото)', () => {
  const stdSizes = (f: number[]): Size[] => [
    [90, 68, f[0]],
    [320, 240, f[1]],
    [800, 600, f[2]],
    [1280, 960, f[3]],
    [2560, 1920, f[4]],
  ];

  it('ставит в очередь файл размера для ленты (1280), а не самый большой', async () => {
    const f = ids(5);
    const row = await mapTdMessage(photoMessage(1, stdSizes(f)), 0);
    expect(downloads()).toEqual([{ fileId: f[3], priority: DEFAULT_MAP_DOWNLOAD_PRIORITY }]);
    expect(row?.mediaFullFileId).toBe(f[3]);
    expect(downloads().some((d) => d.fileId === f[4])).toBe(false);
  });

  it('пока файл не скачан, показывается мини-превью, габариты — из выбранного размера', async () => {
    const f = ids(5);
    const row = await mapTdMessage(photoMessage(2, stdSizes(f)), 0);
    expect(row?.mediaUri).toMatch(/^data:image\/jpeg;base64,/);
    expect(row?.width).toBe(1280);
    expect(row?.height).toBe(960);
    expect(row?.kind).toBe('image');
  });

  it('базовый приоритет задаётся опцией (фоновая подгрузка ставит минимальный)', async () => {
    const f = ids(5);
    await mapTdMessage(photoMessage(3, stdSizes(f)), 0, { downloadPriority: 1 });
    expect(downloads()).toEqual([{ fileId: f[3], priority: 1 }]);
  });

  it('режим mediaLocalOnly: ничего не качает, но запоминает файл для докачки экраном', async () => {
    const f = ids(5);
    const row = await mapTdMessage(photoMessage(4, stdSizes(f)), 0, { mediaLocalOnly: true });
    expect(downloads()).toEqual([]);
    expect(row?.mediaFullFileId).toBe(f[3]);
  });

  it('нужный размер уже на диске: показывается файл, докачки и ожидания нет', async () => {
    const f = ids(5);
    const sizes = stdSizes(f);
    sizes[3] = [1280, 960, f[3], '/data/y.jpg'];
    const row = await mapTdMessage(photoMessage(5, sizes), 0);
    expect(row?.mediaUri).toBe('file:///data/y.jpg');
    expect(row?.mediaFullFileId).toBeUndefined();
    expect(downloads()).toEqual([]);
  });

  it('на диске оригинал (смотрели раньше): используется он, лишнего не качается', async () => {
    const f = ids(5);
    const sizes = stdSizes(f);
    sizes[4] = [2560, 1920, f[4], '/data/w.jpg'];
    const row = await mapTdMessage(photoMessage(6, sizes), 0);
    expect(row?.mediaUri).toBe('file:///data/w.jpg');
    expect(row?.mediaFullFileId).toBeUndefined();
    expect(downloads()).toEqual([]);
  });

  it('на диске только маленькое превью: показываем его и докачиваем целевой размер', async () => {
    const f = ids(5);
    const sizes = stdSizes(f);
    sizes[1] = [320, 240, f[1], '/data/m.jpg'];
    const row = await mapTdMessage(photoMessage(7, sizes), 0);
    expect(row?.mediaUri).toBe('file:///data/m.jpg');
    expect(row?.mediaFullFileId).toBe(f[3]);
    expect(downloads()).toEqual([{ fileId: f[3], priority: DEFAULT_MAP_DOWNLOAD_PRIORITY }]);
  });

  it('регрессия: маленькое превью + mediaLocalOnly сохраняет путь обновления (раньше оставалось навсегда)', async () => {
    const f = ids(5);
    const sizes = stdSizes(f);
    sizes[1] = [320, 240, f[1], '/data/m.jpg'];
    const row = await mapTdMessage(photoMessage(8, sizes), 0, { mediaLocalOnly: true });
    expect(row?.mediaUri).toBe('file:///data/m.jpg');
    expect(row?.mediaFullFileId).toBe(f[3]);
    expect(downloads()).toEqual([]);
  });

  it('фото без размеров не падает', async () => {
    const row = await mapTdMessage(photoMessage(9, []), 0);
    expect(row?.kind).toBe('image');
    expect(row?.mediaFullFileId).toBeUndefined();
    expect(downloads()).toEqual([]);
  });
});

/* ───────────── голосовые и документы ───────────── */

describe('голосовые', () => {
  it('регрессия: приоритет не максимальный — старые голосовые не обгоняют видимые фото', async () => {
    const [fid] = ids(1);
    const row = await mapTdMessage(voiceMessage(20, fid), 0);
    expect(downloads()).toEqual([{ fileId: fid, priority: DEFAULT_MAP_DOWNLOAD_PRIORITY }]);
    expect(DEFAULT_MAP_DOWNLOAD_PRIORITY).toBeLessThan(32);
    expect(row?.mediaFullFileId).toBe(fid);
    expect(row?.voiceUri).toBeNull();
  });

  it('скачанное голосовое сразу получает адрес файла', async () => {
    const [fid] = ids(1);
    const row = await mapTdMessage(voiceMessage(21, fid, '/data/v.ogg'), 0);
    expect(row?.voiceUri).toBe('file:///data/v.ogg');
    expect(row?.mediaFullFileId).toBeUndefined();
    expect(downloads()).toEqual([]);
  });

  it('mediaLocalOnly не качает', async () => {
    const [fid] = ids(1);
    await mapTdMessage(voiceMessage(22, fid), 0, { mediaLocalOnly: true });
    expect(downloads()).toEqual([]);
  });
});

describe('документы', () => {
  it('регрессия: у нескачанного документа есть id файла — строка обновится, когда он докачается', async () => {
    const [fid] = ids(1);
    const row = await mapTdMessage(documentMessage(30, fid), 0);
    expect(row?.kind).toBe('file');
    expect(row?.mediaUri).toBeNull();
    expect(row?.mediaFullFileId).toBe(fid);
    expect(downloads()).toEqual([{ fileId: fid, priority: DEFAULT_MAP_DOWNLOAD_PRIORITY }]);
  });

  it('скачанный документ — с адресом и без ожидания', async () => {
    const [fid] = ids(1);
    const row = await mapTdMessage(documentMessage(31, fid, '/data/report.pdf'), 0);
    expect(row?.mediaUri).toBe('file:///data/report.pdf');
    expect(row?.mediaFullFileId).toBeUndefined();
  });

  it('после updateFile строка документа получает адрес (раньше — только после перезагрузки чата)', async () => {
    const [fid] = ids(1);
    const row = (await mapTdMessage(documentMessage(32, fid), 0)) as TelegramMessageRow;
    const patched = patchMessagesWithTdlibFile([row], tdFile(fid, '/data/report.pdf'));
    expect(patched[0].mediaUri).toBe('file:///data/report.pdf');
    expect(patched[0].mediaFullFileId).toBeUndefined();
  });
});

/* ───────────── история и фоновая подгрузка ───────────── */

describe('история чата', () => {
  const history = (messages: unknown[]) => (request: Record<string, unknown>) => {
    if (request['@type'] === 'getChat') return Promise.resolve({ last_read_outbox_message_id: 0 });
    if (request['@type'] === 'getChatHistory') return Promise.resolve({ messages });
    return Promise.resolve({});
  };

  it('регрессия: фоновая подгрузка ставит загрузки с минимальным приоритетом', async () => {
    const f = ids(5);
    mockSend.mockImplementation(
      history([
        photoMessage(40, [
          [800, 600, f[2]],
          [1280, 960, f[3]],
          [2560, 1920, f[4]],
        ]),
      ]),
    );
    await fetchTelegramHistoryBatch({
      chatId: 1,
      onlyLocal: false,
      downloadPriority: PRELOAD_DOWNLOAD_PRIORITY,
    });
    expect(PRELOAD_DOWNLOAD_PRIORITY).toBe(1);
    expect(downloads()).toEqual([{ fileId: f[3], priority: 1 }]);
  });

  it('без явного приоритета (открытый чат) — обычный базовый', async () => {
    const f = ids(2);
    mockSend.mockImplementation(history([photoMessage(41, [[1280, 960, f[0]]])]));
    await fetchTelegramHistoryBatch({ chatId: 1, onlyLocal: false });
    expect(downloads()).toEqual([{ fileId: f[0], priority: DEFAULT_MAP_DOWNLOAD_PRIORITY }]);
  });

  it('локальный режим истории ничего не качает', async () => {
    const f = ids(2);
    mockSend.mockImplementation(history([photoMessage(42, [[1280, 960, f[0]]])]));
    const { rows } = await fetchTelegramHistoryBatch({ chatId: 1, onlyLocal: true });
    expect(downloads()).toEqual([]);
    expect(rows[0].mediaFullFileId).toBe(f[0]);
  });
});

/* ───────────── видео: размер и автозагрузка ───────────── */

const videoMessage = (
  messageId: number,
  fileId: number,
  file: { size?: number; expected_size?: number; local?: string } = {},
  caption = 'ролик',
) => ({
  id: messageId,
  date: 1_700_000_000 + messageId,
  is_outgoing: false,
  content: {
    '@type': 'messageVideo',
    caption: { text: caption },
    video: {
      width: 1280,
      height: 720,
      duration: 90,
      video: {
        id: fileId,
        size: file.size ?? 0,
        expected_size: file.expected_size ?? 0,
        local: { path: file.local ?? '', is_downloading_completed: Boolean(file.local) },
      },
    },
  },
});

describe('видео: размер файла для решения «качать сам или ждать нажатия»', () => {
  it('точный размер попадает в строку, сам файл при маппинге не качается', async () => {
    const [fid] = ids(1);
    const row = await mapTdMessage(videoMessage(60, fid, { size: 48 * 1024 * 1024 }), 0);
    expect(row?.kind).toBe('video');
    expect(row?.mediaFullFileId).toBe(fid);
    expect(row?.mediaFullFileSize).toBe(48 * 1024 * 1024);
    expect(downloads()).toEqual([]);
  });

  it('если точный размер неизвестен (0), берётся ожидаемый', async () => {
    const [fid] = ids(1);
    const row = await mapTdMessage(videoMessage(61, fid, { size: 0, expected_size: 5_000_000 }), 0);
    expect(row?.mediaFullFileSize).toBe(5_000_000);
  });

  it('размера нет совсем — поле пустое (такое видео по нажатию, не сразу)', async () => {
    const [fid] = ids(1);
    const row = await mapTdMessage(videoMessage(62, fid, {}), 0);
    expect(row?.mediaFullFileSize).toBeUndefined();
  });

  it('скачанное видео — без ожидания и размера', async () => {
    const [fid] = ids(1);
    const row = await mapTdMessage(videoMessage(63, fid, { size: 9_000_000, local: '/data/v.mp4' }), 0);
    expect(row?.mediaUri).toBe('file:///data/v.mp4');
    expect(row?.mediaFullFileId).toBeUndefined();
    expect(row?.mediaFullFileSize).toBeUndefined();
  });

  it('после updateFile размер снимается вместе с ожиданием', async () => {
    const [fid] = ids(1);
    const row = (await mapTdMessage(videoMessage(64, fid, { size: 30_000_000 }), 0)) as TelegramMessageRow;
    const patched = patchMessagesWithTdlibFile([row], { id: fid, local: { path: '/data/v.mp4', is_downloading_completed: true } });
    expect(patched[0].mediaUri).toBe('file:///data/v.mp4');
    expect(patched[0].mediaFullFileId).toBeUndefined();
    expect(patched[0].mediaFullFileSize).toBeUndefined();
  });
});

describe('какие видео показываются как «качается сейчас»', () => {
  const videoRow = (messageId: number, fileId: number, size?: number): TelegramMessageRow =>
    ({
      id: String(messageId),
      messageId,
      kind: 'video',
      text: '',
      outgoing: false,
      dateMs: messageId,
      status: 'sent',
      mediaFullFileId: fileId,
      mediaFullFileSize: size,
    }) as TelegramMessageRow;

  it('большое и неизвестного размера видео ждут нажатия — индикатор не крутится', () => {
    const rows = [videoRow(1, 701, 200 * 1024 * 1024), videoRow(2, 702, undefined), videoRow(3, 703, 2 * 1024 * 1024)];
    expect(collectPendingTdlibVideoFileIds(rows)).toEqual([703]);
  });

  it('кружок всегда считается качающимся, альбомные видео — по размеру', () => {
    const rows = [
      { ...videoRow(1, 801), kind: 'video_note', mediaFullFileSize: undefined } as TelegramMessageRow,
      {
        ...videoRow(2, 0),
        kind: 'album',
        mediaFullFileId: undefined,
        albumMedia: [
          { messageId: 3, kind: 'video', mediaFullFileId: 802, mediaFullFileSize: 90 * 1024 * 1024 },
          { messageId: 4, kind: 'video', mediaFullFileId: 803, mediaFullFileSize: 1024 * 1024 },
          { messageId: 5, kind: 'image', mediaFullFileId: 804 },
        ],
      } as TelegramMessageRow,
    ];
    expect(collectPendingTdlibVideoFileIds(rows).sort()).toEqual([801, 803]);
  });
});

describe('отмена загрузки по нажатию', () => {
  it('шлёт cancelDownloadFile и позволяет сразу начать загрузку заново', () => {
    const [fid] = ids(1);
    scheduleTdlibFileDownload(fid, 32);
    scheduleTdlibFileDownload(fid, 32); // повтор в окне 15 с отбрасывается
    expect(downloads()).toEqual([{ fileId: fid, priority: 32 }]);

    cancelTdlibFileDownload(fid);
    const cancels = mockSend.mock.calls.map((c) => c[0]).filter((r) => r['@type'] === 'cancelDownloadFile');
    expect(cancels).toEqual([{ '@type': 'cancelDownloadFile', file_id: fid, only_if_pending: false }]);

    scheduleTdlibFileDownload(fid, 32);
    expect(downloads()).toEqual([
      { fileId: fid, priority: 32 },
      { fileId: fid, priority: 32 },
    ]);
  });
});

/* ───────────── профиль: миниатюры плиток ───────────── */

describe('фото для сетки профиля (регрессия: каждая плитка качала и декодировала полное фото)', () => {
  const sizes = (f: number[]): Size[] => [
    [90, 68, f[0]],
    [320, 240, f[1]],
    [800, 600, f[2]],
    [1280, 960, f[3]],
    [2560, 1920, f[4]],
  ];
  const grid = { mediaLocalOnly: true, photoGridThumbnail: true };

  it('ничего не качает при маппинге, миниатюра — размер 320, полный — для ленты (1280)', async () => {
    const f = ids(5);
    const row = await mapTdMessage(photoMessage(70, sizes(f)), 0, grid);
    expect(downloads()).toEqual([]);
    expect(row?.thumbnailFileId).toBe(f[1]);
    expect(row?.thumbnailUri).toBeUndefined();
    expect(row?.mediaFullFileId).toBe(f[3]);
    expect(row?.mediaUri).toMatch(/^data:image\/jpeg;base64,/);
    expect(row?.width).toBe(1280);
    expect(row?.height).toBe(960);
  });

  it('миниатюра уже на диске: плитка берёт её, полный размер ждёт открытия', async () => {
    const f = ids(5);
    const s = sizes(f);
    s[1] = [320, 240, f[1], '/data/m.jpg'];
    const row = await mapTdMessage(photoMessage(71, s), 0, grid);
    expect(row?.thumbnailUri).toBe('file:///data/m.jpg');
    expect(row?.thumbnailFileId).toBeUndefined();
    expect(row?.mediaFullFileId).toBe(f[3]);
    expect(downloads()).toEqual([]);
  });

  it('на диске полный размер: миниатюра отдельно не качается, плитка и просмотр берут файл', async () => {
    const f = ids(5);
    const s = sizes(f);
    s[3] = [1280, 960, f[3], '/data/y.jpg'];
    const row = await mapTdMessage(photoMessage(72, s), 0, grid);
    expect(row?.thumbnailFileId).toBeUndefined();
    expect(row?.thumbnailUri).toBe('file:///data/y.jpg');
    expect(row?.mediaUri).toBe('file:///data/y.jpg');
    expect(row?.mediaFullFileId).toBeUndefined();
  });

  it('updateFile миниатюры и полного файла обновляют каждое своё поле', async () => {
    const f = ids(5);
    const row = (await mapTdMessage(photoMessage(73, sizes(f)), 0, grid)) as TelegramMessageRow;
    const afterThumb = patchMessagesWithTdlibFile([row], tdFile(f[1], '/data/m.jpg'));
    expect(afterThumb[0].thumbnailUri).toBe('file:///data/m.jpg');
    expect(afterThumb[0].thumbnailFileId).toBeUndefined();
    expect(afterThumb[0].mediaFullFileId).toBe(f[3]);
    const afterFull = patchMessagesWithTdlibFile(afterThumb, tdFile(f[3], '/data/y.jpg'));
    expect(afterFull[0].mediaUri).toBe('file:///data/y.jpg');
    expect(afterFull[0].mediaFullFileId).toBeUndefined();
    expect(afterFull[0].thumbnailUri).toBe('file:///data/m.jpg');
  });

  it('обычный чат не затронут: без опции миниатюры нет, полный размер качается как раньше', async () => {
    const f = ids(5);
    const row = await mapTdMessage(photoMessage(74, sizes(f)), 0);
    expect(row?.thumbnailFileId).toBeUndefined();
    expect(downloads()).toEqual([{ fileId: f[3], priority: DEFAULT_MAP_DOWNLOAD_PRIORITY }]);
  });

  it('документы в профиле (mediaLocalOnly) не качаются целиком, id остаётся для открытия', async () => {
    const [fid] = ids(1);
    const row = await mapTdMessage(documentMessage(75, fid), 0, grid);
    expect(downloads()).toEqual([]);
    expect(row?.mediaFullFileId).toBe(fid);
  });
});

/* ───────────── пачка updateFile ───────────── */

describe('пачка updateFile', () => {
  const imageRow = (messageId: number, fileId: number): TelegramMessageRow =>
    ({
      id: String(messageId),
      messageId,
      kind: 'image',
      text: '',
      outgoing: false,
      dateMs: messageId,
      status: 'sent',
      mediaFullFileId: fileId,
      mediaUri: 'data:image/jpeg;base64,AAAA',
    }) as TelegramMessageRow;

  it('несколько файлов применяются за один проход', () => {
    const rows = [imageRow(1, 501), imageRow(2, 502), imageRow(3, 503)];
    const patched = patchMessagesWithTdlibFiles(rows, [
      tdFile(501, '/a.jpg'),
      tdFile(503, '/c.jpg'),
    ]);
    expect(patched[0].mediaUri).toBe('file:///a.jpg');
    expect(patched[1].mediaUri).toBe('data:image/jpeg;base64,AAAA');
    expect(patched[2].mediaUri).toBe('file:///c.jpg');
    // не тронутая строка — тот же объект
    expect(patched[1]).toBe(rows[1]);
  });

  it('если ничего не изменилось, возвращается тот же массив (чат не перерисуется)', () => {
    const rows = [imageRow(1, 501)];
    expect(patchMessagesWithTdlibFiles(rows, [tdFile(999, '/x.jpg')])).toBe(rows);
    expect(patchMessagesWithTdlibFiles(rows, [])).toBe(rows);
    // файл ещё качается (нет is_downloading_completed) — тоже ничего не меняет
    expect(patchMessagesWithTdlibFiles(rows, [tdFile(501)])).toBe(rows);
  });

  it('completedTdlibFileIds берёт только полностью скачанные', () => {
    expect(
      completedTdlibFileIds([tdFile(1, '/a'), tdFile(2), { id: 3 }, tdFile(4, '/d')]),
    ).toEqual([1, 4]);
    expect(completedTdlibFileIds([])).toEqual([]);
  });
});
