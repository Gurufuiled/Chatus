import { Module } from '@nestjs/common';
import { RelayPolicyConfig } from './relay-policy.config';

@Module({
  providers: [RelayPolicyConfig],
  exports: [RelayPolicyConfig],
})
export class RelayPolicyModule {}
