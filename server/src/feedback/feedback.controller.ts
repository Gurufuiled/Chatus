import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  async list(
    @CurrentUser() user: User,
    @Query('type') type: string | undefined,
  ) {
    if (type !== 'bug' && type !== 'suggestion') {
      throw new BadRequestException('Query "type" must be bug or suggestion');
    }
    return this.feedbackService.list(user, type);
  }

  @Post()
  async create(@CurrentUser() user: User, @Body() dto: CreateFeedbackDto) {
    return this.feedbackService.create(user.id, dto);
  }
}
