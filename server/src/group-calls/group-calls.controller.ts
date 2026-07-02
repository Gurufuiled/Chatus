import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common';
import { GroupCallsService } from './group-calls.service';

@Controller('chats/:chatId/group-calls')
@UseGuards(JwtAuthGuard)
export class ChatGroupCallsController {
  constructor(private readonly groupCallsService: GroupCallsService) {}

  @Post()
  createRoom(@Param('chatId') chatId: string, @CurrentUser() user: User) {
    return this.groupCallsService.createRoom(chatId, user.id);
  }

  @Get('active')
  getActiveRoom(@Param('chatId') chatId: string, @CurrentUser() user: User) {
    return this.groupCallsService.getActiveRoom(chatId, user.id);
  }
}

@Controller('group-calls')
@UseGuards(JwtAuthGuard)
export class GroupCallsController {
  constructor(private readonly groupCallsService: GroupCallsService) {}

  @Post(':roomId/join')
  joinRoom(@Param('roomId') roomId: string, @CurrentUser() user: User) {
    return this.groupCallsService.joinRoom(roomId, user.id);
  }

  @Post(':roomId/leave')
  leaveRoom(@Param('roomId') roomId: string, @CurrentUser() user: User) {
    return this.groupCallsService.leaveRoom(roomId, user.id);
  }

  @Post(':roomId/end')
  endRoom(@Param('roomId') roomId: string, @CurrentUser() user: User) {
    return this.groupCallsService.endRoom(roomId, user.id);
  }
}
