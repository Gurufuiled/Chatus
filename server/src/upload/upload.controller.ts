import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService } from './upload.service';
import { MAX_FILE_SIZE } from './upload.constants';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async uploadFile(@UploadedFile() file: { originalname: string; mimetype: string; size: number; path?: string; buffer?: Buffer } | undefined) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    this.logger.log(
      `POST /upload received: name=${file.originalname} mime=${file.mimetype} size=${file.size}`,
    );
    const result = await this.uploadService.saveFile(file);
    this.logger.log(
      `POST /upload success: kind=${result.media_kind} mime=${result.mime_type} size=${result.file_size} url=${result.url}`,
    );
    return result;
  }
}
