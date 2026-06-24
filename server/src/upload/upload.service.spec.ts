import { UploadService } from './upload.service';
import { RustMediaWorkerService } from './rust-media-worker.service';

describe('UploadService.tryDeleteServerStoredUpload', () => {
  it('no-ops on empty or non-upload URLs', async () => {
    const worker = {} as RustMediaWorkerService;
    const svc = new UploadService(worker);
    await expect(
      svc.tryDeleteServerStoredUpload(null),
    ).resolves.toBeUndefined();
    await expect(svc.tryDeleteServerStoredUpload('')).resolves.toBeUndefined();
    await expect(
      svc.tryDeleteServerStoredUpload('https://cdn.example/x'),
    ).resolves.toBeUndefined();
  });

  it('no-ops when file does not exist (missing uploads name)', async () => {
    const worker = {} as RustMediaWorkerService;
    const svc = new UploadService(worker);
    await expect(
      svc.tryDeleteServerStoredUpload(
        '/uploads/nonexistent-jest-mailbox-cleanup.bin',
      ),
    ).resolves.toBeUndefined();
  });
});
