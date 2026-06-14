import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, LimitPipe } from '../common';
import { CreateMessageDto } from './dto/create-message.dto';
import {
  assertValidMessageMediaItems,
  normalizeCreateMessageMedia,
} from './dto/create-message-media.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '@prisma/client';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly realtimeService: RealtimeService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':id/messages')
  async getMessages(
    @Param('id') chatId: string,
    @CurrentUser() user: User,
    @Query('limit', new LimitPipe(1, 100, 50)) limit: number,
    @Query('before') before?: string,
  ) {
    return this.messagesService.getMessagesForChat(
      chatId,
      user.id,
      limit,
      before,
    );
  }

  @Post(':id/messages')
  async createMessage(
    @Param('id') chatId: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: User,
  ) {
    if (dto.reply_to_id) {
      const replyTarget = await this.prisma.message.findFirst({
        where: { id: dto.reply_to_id, chatId },
        select: { id: true },
      });
      if (!replyTarget) {
        throw new BadRequestException('Reply target not found in this chat');
      }
    }

    const msgType = dto.msg_type ?? 'text';
    if (msgType === 'text') {
      const text = dto.content?.trim() ?? '';
      if (!text) {
        throw new BadRequestException('content is required for text messages');
      }
    } else {
      const mediaItems = normalizeCreateMessageMedia(dto.media);
      try {
        assertValidMessageMediaItems(mediaItems);
      } catch (err) {
        throw new BadRequestException(
          err instanceof Error ? err.message : 'Invalid media payload',
        );
      }
    }

    const message = await this.messagesService.createMessage(
      chatId,
      user.id,
      msgType,
      dto.content ?? null,
      dto.media,
      dto.reply_to_id ?? null,
      undefined,
      { relayMailbox: true },
    );

    await this.realtimeService.broadcastToChatMembers(chatId, {
      type: 'message',
      message: {
        ...message,
        client_temp_id: dto.client_temp_id ?? null,
      },
    });

    return message;
  }
}
