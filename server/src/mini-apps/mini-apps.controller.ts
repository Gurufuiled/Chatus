import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsUrl, Length } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { User } from '@prisma/client';
import { MiniAppsService } from './mini-apps.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatsService } from '../chats/chats.service';
import {
  CHATUS_FATHER_USER_ID,
  DEVELOPER_AGREEMENT_TEXT,
  DEVELOPER_AGREEMENT_VERSION,
} from './mini-apps.constants';

class ExchangeDto {
  @IsString()
  init_data!: string;
}

class SendDataDto {
  @IsString()
  init_data!: string;

  @IsString()
  data!: string;
}

class CreateAppDto {
  @IsString()
  @Length(2, 64)
  title!: string;

  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  base_url!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon_url?: string;
}

@Controller('mini-apps')
export class MiniAppsController {
  constructor(
    private readonly miniApps: MiniAppsService,
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
  ) {}

  @Get()
  async listPublished() {
    return { apps: await this.miniApps.listPublishedApps() };
  }

  @Get('agreement')
  getAgreement() {
    return {
      version: DEVELOPER_AGREEMENT_VERSION,
      text: DEVELOPER_AGREEMENT_TEXT,
    };
  }

  @Get('chatus-father')
  @UseGuards(JwtAuthGuard)
  async openChatusFatherChat(@CurrentUser() user: User) {
    const father = await this.prisma.user.findUnique({
      where: { id: CHATUS_FATHER_USER_ID },
    });
    if (!father) {
      throw new NotFoundException('ChatusFather user not found. Run migrations.');
    }
    const chat = await this.chats.createOrFindChat(user, 'private', undefined, [
      CHATUS_FATHER_USER_ID,
    ]);
    return { chat };
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async myApps(@CurrentUser() user: User) {
    return {
      is_developer: await this.miniApps.isDeveloper(user.id),
      apps: (await this.miniApps.isDeveloper(user.id))
        ? await this.miniApps.listOwnedApps(user.id)
        : [],
    };
  }

  @Post('my')
  @UseGuards(JwtAuthGuard)
  async createApp(@CurrentUser() user: User, @Body() dto: CreateAppDto) {
    const app = await this.miniApps.createApp(user.id, dto);
    return { app };
  }

  @Get(':appId')
  async getApp(@Param('appId') appId: string) {
    return { app: await this.miniApps.getPublicApp(appId) };
  }

  @Post(':appId/session')
  @UseGuards(JwtAuthGuard)
  async createSession(
    @CurrentUser() user: User,
    @Param('appId') appId: string,
  ) {
    return this.miniApps.createInitBundle(appId, user.id);
  }

  @Post(':appId/session/exchange')
  async exchangeSession(
    @Param('appId') appId: string,
    @Body() dto: ExchangeDto,
  ) {
    return this.miniApps.exchangeInitData(appId, dto.init_data);
  }

  @Post(':appId/data')
  async sendData(@Param('appId') appId: string, @Body() dto: SendDataDto) {
    return this.miniApps.receiveSendData(appId, dto.init_data, dto.data);
  }
}
