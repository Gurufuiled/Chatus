import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { GroupCallsService } from './group-calls.service';

function resolveWebhookBody(req: RawBodyRequest<Request>): Buffer {
  if (req.rawBody && Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0) {
    return req.rawBody;
  }
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.length > 0) {
    return Buffer.from(req.body, 'utf8');
  }
  throw new BadRequestException('Missing LiveKit webhook body');
}

@Controller('livekit')
export class LivekitWebhookController {
  constructor(private readonly groupCallsService: GroupCallsService) {}

  @Post('webhook')
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authorization?: string,
  ) {
    const rawBody = resolveWebhookBody(req);
    const authHeader = authorization ?? req.headers.authorization;
    return this.groupCallsService.handleWebhook(rawBody, authHeader);
  }
}
