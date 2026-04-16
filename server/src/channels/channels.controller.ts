import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, LimitPipe } from '../common';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { CreateChannelPostDto } from './dto/create-channel-post.dto';
import { CreateDiscussionMessageDto } from './dto/create-discussion-message.dto';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';
import { GetChannelMembersQueryDto } from './dto/get-channel-members-query.dto';
import { UpdateChannelMemberDto } from './dto/update-channel-member.dto';

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  async getCatalog(@CurrentUser() user: User) {
    return this.channelsService.getCatalog(user.id);
  }

  @Get('catalog')
  async getCatalogAlias(@CurrentUser() user: User) {
    return this.channelsService.getCatalog(user.id);
  }

  @Get('search')
  async searchChannels(
    @CurrentUser() user: User,
    @Query('q') query = '',
    @Query('limit', new LimitPipe(1, 50, 20)) limit: number,
  ) {
    return this.channelsService.searchChannels(user.id, query, limit);
  }

  @Get(':id')
  async getChannel(@Param('id') channelId: string, @CurrentUser() user: User) {
    return this.channelsService.getChannelById(channelId, user.id);
  }

  @Get(':id/feed')
  async getFeed(
    @Param('id') channelId: string,
    @CurrentUser() user: User,
    @Query('limit', new LimitPipe(1, 100, 30)) limit: number,
    @Query('before') before?: string,
  ) {
    return this.channelsService.getFeed(channelId, user.id, limit, before);
  }

  @Get(':id/discussion/:postId')
  async getDiscussion(
    @Param('id') channelId: string,
    @Param('postId') postId: string,
    @CurrentUser() user: User,
    @Query('limit', new LimitPipe(1, 100, 50)) limit: number,
    @Query('before') before?: string,
  ) {
    return this.channelsService.getDiscussion(
      channelId,
      postId,
      user.id,
      limit,
      before,
    );
  }

  @Post()
  async createChannel(@Body() dto: CreateChannelDto, @CurrentUser() user: User) {
    return this.channelsService.createChannel(user.id, dto);
  }

  @Patch(':id')
  async updateChannel(
    @Param('id') channelId: string,
    @Body() dto: UpdateChannelDto,
    @CurrentUser() user: User,
  ) {
    return this.channelsService.updateChannel(channelId, user.id, dto);
  }

  @Post(':id/subscribe')
  async subscribe(@Param('id') channelId: string, @CurrentUser() user: User) {
    return this.channelsService.subscribe(channelId, user.id);
  }

  @Post(':id/checkout/mock')
  async mockCheckout(@Param('id') channelId: string, @CurrentUser() user: User) {
    return this.channelsService.mockCheckout(channelId, user.id);
  }

  @Post(':id/posts')
  async publishPost(
    @Param('id') channelId: string,
    @Body() dto: CreateChannelPostDto,
    @CurrentUser() user: User,
  ) {
    return this.channelsService.publishPost(channelId, user.id, dto);
  }

  @Post(':id/discussion/:postId/messages')
  async createDiscussionMessage(
    @Param('id') channelId: string,
    @Param('postId') postId: string,
    @Body() dto: CreateDiscussionMessageDto,
    @CurrentUser() user: User,
  ) {
    return this.channelsService.createDiscussionMessage(channelId, postId, user.id, dto);
  }

  @Post(':id/posts/:postId/reactions')
  async toggleReaction(
    @Param('id') channelId: string,
    @Param('postId') postId: string,
    @Body() dto: ToggleReactionDto,
    @CurrentUser() user: User,
  ) {
    return this.channelsService.togglePostReaction(channelId, postId, user.id, dto.emoji);
  }

  @Get(':id/members')
  async getMembers(
    @Param('id') channelId: string,
    @CurrentUser() user: User,
    @Query() query: GetChannelMembersQueryDto,
  ) {
    return this.channelsService.getChannelMembers(channelId, user.id, query);
  }

  @Patch(':id/members/:memberId')
  async updateMember(
    @Param('id') channelId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateChannelMemberDto,
    @CurrentUser() user: User,
  ) {
    return this.channelsService.updateChannelMember(channelId, user.id, memberId, dto);
  }

  @Post(':id/members/:memberId/ban')
  async banMember(
    @Param('id') channelId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: User,
  ) {
    return this.channelsService.banChannelMember(channelId, user.id, memberId);
  }

  @Delete(':id/members/:memberId/ban')
  async unbanMember(
    @Param('id') channelId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: User,
  ) {
    return this.channelsService.unbanChannelMember(channelId, user.id, memberId);
  }

  @Delete(':id/members/:memberId')
  async removeMember(
    @Param('id') channelId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: User,
  ) {
    return this.channelsService.removeChannelMember(channelId, user.id, memberId);
  }
}
