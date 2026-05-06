import { Module } from '@nestjs/common';
import { AdminRelayPolicyController } from './admin-relay-policy.controller';
import { AdminRelayPolicyService } from './admin-relay-policy.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RelayPolicyModule } from '../config/relay-policy.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, RelayPolicyModule, AuthModule],
  controllers: [AdminRelayPolicyController],
  providers: [AdminRelayPolicyService],
  exports: [AdminRelayPolicyService],
})
export class AdminModule {}
