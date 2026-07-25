import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientLogsController } from './client-logs.controller';
import { ClientLogsService } from './client-logs.service';

@Module({
  imports: [AuthModule],
  controllers: [ClientLogsController],
  providers: [ClientLogsService],
})
export class ClientLogsModule {}
