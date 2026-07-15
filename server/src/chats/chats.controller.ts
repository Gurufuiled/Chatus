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
import { UpdateGroupSettingsDto } from './dto/update-group-settings.dto';
import { UpdateGroupAdminDto } from './dto/update-group-admin.dto';
import { PinMessageDto } from './dto/pin-message.dto';
import { JoinGroupByInviteDto } from './dto/join-group-by-invite.dto';
import { CreatePollDto, VotePollDto } from './dto/create-poll.dto';
import { RealtimeService } from '../realtime/realtime.service';
import type { User } from '@prisma/client';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  async getChats(@CurrentUser() user: User) {
    return this.chatsService.getChatsForUser(user.id, true);
  }

  /** Resolve a group invite token (preview before join). */
  @Get('invite/:token')
  async resolveInvite(@Param('token') token: string) {
    return this.chatsService.resolveInviteToken(token);
  }

  @Post('join')
  async joinByInvite(
    @Body() dto: JoinGroupByInviteDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.joinGroupByInvite(user, dto.invite_token);
  }

  @Get(':id')
  async getChat(@Param('id') chatId: string, @CurrentUser() user: User) {
    return this.chatsService.getChatById(chatId, user.id);
  }

  @Post(':id/read')
  async markChatRead(@Param('id') chatId: string, @CurrentUser() user: User) {
    return this.chatsService.markChatRead(chatId, user.id);
  }

  @Get(':id/settings')
  async getSettings(@Param('id') chatId: string, @CurrentUser() user: User) {
    return this.chatsService.getGroupSettings(user, chatId);
  }

  @Patch(':id/settings')
  async updateSettings(
    @Param('id') chatId: string,
    @Body() dto: UpdateGroupSettingsDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.updateGroupSettings(user, chatId, dto);
  }

  @Get(':id/invite-link')
  async getInviteLink(@Param('id') chatId: string, @CurrentUser() user: User) {
    return this.chatsService.getInviteLink(user, chatId);
  }

  @Post(':id/invite-link/revoke')
  async revokeInviteLink(
    @Param('id') chatId: string,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.revokeInviteLink(user, chatId);
  }

  @Post(':id/invite-link/recreate')
  async recreateInviteLink(
    @Param('id') chatId: string,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.recreateInviteLink(user, chatId);
  }

  @Post(':id/pin')
  async pinMessage(
    @Param('id') chatId: string,
    @Body() dto: PinMessageDto,
    @CurrentUser() user: User,
  ) {
    const chat = await this.chatsService.setPinnedMessage(
      chatId,
      user.id,
      dto.message_id,
      dto.notify !== false,
    );
    await this.realtime.broadcastToChatMembers(chatId, {
      type: 'chat_pinned_message_updated',
      chat_id: chat.id,
      pinned_message_id: chat.pinned_message_id,
      pinned_notify: chat.pinned_notify ?? true,
    });
    return chat;
  }

  @Delete(':id/pin')
  async unpinMessage(@Param('id') chatId: string, @CurrentUser() user: User) {
    const chat = await this.chatsService.setPinnedMessage(
      chatId,
      user.id,
      null,
    );
    await this.realtime.broadcastToChatMembers(chatId, {
      type: 'chat_pinned_message_updated',
      chat_id: chat.id,
      pinned_message_id: chat.pinned_message_id,
      pinned_notify: chat.pinned_notify ?? true,
    });
    return chat;
  }

  @Post(':id/polls')
  async createPoll(
    @Param('id') chatId: string,
    @Body() dto: CreatePollDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.createPoll(user, chatId, dto);
  }

  @Get(':id/polls/:messageId')
  async getPoll(
    @Param('id') chatId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.getPollForUser(chatId, user.id, messageId);
  }

  @Post(':id/polls/:messageId/vote')
  async votePoll(
    @Param('id') chatId: string,
    @Param('messageId') messageId: string,
    @Body() dto: VotePollDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.votePoll(user, chatId, messageId, dto.option_ids);
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

  @Patch(':id/members/:memberId/admin')
  async updateAdmin(
    @Param('id') chatId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateGroupAdminDto,
    @CurrentUser() user: User,
  ) {
    return this.chatsService.updateGroupAdmin(user, chatId, memberId, dto);
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
