import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { RustMediaWorkerService } from './rust-media-worker.service';

@Module({
  controllers: [UploadController],
  providers: [UploadService, RustMediaWorkerService],
})
export class UploadModule {}
