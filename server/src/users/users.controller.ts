import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AddressBookService } from './address-book.service';
import { PeerContactService } from './peer-contact.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SearchUsersQueryDto } from './dto/search-users-query.dto';
import { CreateAddressBookContactDto } from './dto/create-address-book-contact.dto';
import { UpsertPeerContactDto } from './dto/upsert-peer-contact.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { RequestPhoneChangeDto } from './dto/request-phone-change.dto';
import { VerifyPhoneChangeDto } from './dto/verify-phone-change.dto';
import { SyncPhoneIfEmptyDto } from './dto/sync-phone-if-empty.dto';
import { PhoneChangeService } from './phone-change.service';
import type { User } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly addressBookService: AddressBookService,
    private readonly peerContactService: PeerContactService,
    private readonly phoneChangeService: PhoneChangeService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() user: User) {
    return this.usersService.getProfile(user.id);
  }

  @Get('search')
  async searchUsers(
    @CurrentUser() user: User,
    @Query() query: SearchUsersQueryDto,
  ) {
    return this.usersService.searchUsers(
      user.id,
      query.q ?? '',
      query.limit ?? 20,
    );
  }

  @Get('me/contacts')
  async listMyContacts(@CurrentUser() user: User) {
    return this.addressBookService.list(user.id);
  }

  @Post('me/contacts')
  async createMyContact(
    @CurrentUser() user: User,
    @Body() dto: CreateAddressBookContactDto,
  ) {
    return this.addressBookService.create(user.id, dto);
  }

  @Delete('me/contacts/:contactId')
  async deleteMyContact(
    @CurrentUser() user: User,
    @Param('contactId') contactId: string,
  ) {
    await this.addressBookService.delete(user.id, contactId);
    return { ok: true };
  }

  /** Local peer name/note overrides (visible only to the current user). */
  @Get('me/peer-contacts')
  async listMyPeerContacts(@CurrentUser() user: User) {
    return this.peerContactService.list(user.id);
  }

  @Get('me/peer-contacts/:peerUserId')
  async getMyPeerContact(
    @CurrentUser() user: User,
    @Param('peerUserId') peerUserId: string,
  ) {
    const row = await this.peerContactService.getOne(user.id, peerUserId);
    return row ?? { peer_user_id: peerUserId, first_name: null, last_name: null, note: null, updated_at: 0 };
  }

  @Put('me/peer-contacts/:peerUserId')
  async upsertMyPeerContact(
    @CurrentUser() user: User,
    @Param('peerUserId') peerUserId: string,
    @Body() dto: UpsertPeerContactDto,
  ) {
    const row = await this.peerContactService.upsert(user.id, peerUserId, dto);
    return (
      row ?? {
        peer_user_id: peerUserId,
        first_name: null,
        last_name: null,
        note: null,
        updated_at: 0,
      }
    );
  }

  @Delete('me/peer-contacts/:peerUserId')
  async deleteMyPeerContact(
    @CurrentUser() user: User,
    @Param('peerUserId') peerUserId: string,
  ) {
    await this.peerContactService.delete(user.id, peerUserId);
    return { ok: true };
  }

  @Post('me/phone/request')
  async requestPhoneChange(@CurrentUser() user: User, @Body() dto: RequestPhoneChangeDto) {
    return this.phoneChangeService.request(user.id, dto.new_phone);
  }

  @Post('me/phone/verify')
  async verifyPhoneChange(@CurrentUser() user: User, @Body() dto: VerifyPhoneChangeDto) {
    return this.phoneChangeService.verify(user.id, dto.session_id, dto.code);
  }

  /** Сохранить телефон из Telegram-авторизации, если в профиле Chatus телефона ещё нет. */
  @Post('me/phone/sync-if-empty')
  async syncPhoneIfEmpty(@CurrentUser() user: User, @Body() dto: SyncPhoneIfEmptyDto) {
    return this.phoneChangeService.syncPhoneIfEmpty(user.id, dto.phone);
  }

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, {
      display_name: dto.display_name,
      last_name: dto.last_name,
      bio: dto.bio,
      birthday: dto.birthday,
      avatar_url: dto.avatar_url,
      handle: dto.handle,
    });
  }

  @Post('me/push-token')
  async registerPushToken(
    @CurrentUser() user: User,
    @Body() dto: RegisterPushTokenDto,
  ) {
    await this.usersService.registerPushToken(user.id, dto.expo_token, dto.platform, dto.fcm_token);
    return { ok: true };
  }

  @Delete('me/push-token')
  async unregisterPushToken(
    @CurrentUser() user: User,
    @Body() dto: RegisterPushTokenDto,
  ) {
    await this.usersService.unregisterPushToken(user.id, dto.expo_token);
    return { ok: true };
  }
}
