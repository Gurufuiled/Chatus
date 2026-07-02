import {
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { GroupCallsService } from './group-calls.service';

@Controller('livekit')
export class LivekitWebhookController {
  constructor(private readonly groupCallsService: GroupCallsService) {}

  @Post('webhook')
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authorization?: string,
  ) {
    const rawBody = req.rawBody ?? Buffer.from('');
    return this.groupCallsService.handleWebhook(rawBody, authorization);
  }
}
