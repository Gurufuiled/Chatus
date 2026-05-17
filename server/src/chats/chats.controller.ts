import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ChatsService } from './chats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { AddChatMembersDto } from './dto/add-chat-members.dto';
import { UpdateChatMemberDto } from './dto/update-chat-member.dto';
import type { User } from '@prisma/client';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  async getChats(@CurrentUser() user: User) {
    return this.chatsService.getChatsForUser(user.id, true);
  }

  @Get(':id')
  async getChat(@Param('id') chatId: string, @CurrentUser() user: User) {
    return this.chatsService.getChatById(chatId, user.id);
  }

  @Post(':id/read')
  async markChatRead(@Param('id') chatId: string, @CurrentUser() user: User) {
    return this.chatsService.markChatRead(chatId, user.id);
  }

  @Post()
  async createChat(@Body() dto: CreateChatDto, @CurrentUser() user: User) {
    return this.chatsService.createOrFindChat(
      user,
      dto.chat_type,
      dto.name,
      dto.member_ids,
    );
  }

  @Patch(':id')
  async updateChat(
    @Param('id') chatId: string,
    @Body() dto: UpdateChatDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.updateGroupChat(user, chatId, dto);
  }

  @Post(':id/members')
  async addMembers(
    @Param('id') chatId: string,
    @Body() dto: AddChatMembersDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.addGroupMembers(user, chatId, dto.member_ids);
  }

  @Patch(':id/members/:memberId')
  async updateMember(
    @Param('id') chatId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateChatMemberDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.updateGroupMember(user, chatId, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  async removeMember(
    @Param('id') chatId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.removeGroupMember(user, chatId, memberId);
  }

  @Post(':id/leave')
  async leaveGroup(@Param('id') chatId: string, @CurrentUser() user: User) {
    return this.chatsService.leaveGroup(user, chatId);
  }

  @Delete(':id')
  async deleteChat(@Param('id') chatId: string, @CurrentUser() user: User) {
    return this.chatsService.deleteChat(user, chatId);
  }
}
