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
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SearchUsersQueryDto } from './dto/search-users-query.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import type { User } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, {
      display_name: dto.display_name,
      avatar_url: dto.avatar_url,
      handle: dto.handle,
    });
  }

  @Post('me/push-token')
  async registerPushToken(
    @CurrentUser() user: User,
    @Body() dto: RegisterPushTokenDto,
  ) {
    await this.usersService.registerPushToken(user.id, dto.expo_token, dto.platform);
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
