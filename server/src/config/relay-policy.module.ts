import { Module } from '@nestjs/common';
import { loadRelayPolicyFromEnv, RelayPolicyConfig } from './relay-policy.config';

@Module({
  providers: [
    {
      provide: RelayPolicyConfig,
      useFactory: () => new RelayPolicyConfig(loadRelayPolicyFromEnv()),
    },
  ],
  exports: [RelayPolicyConfig],
})
export class RelayPolicyModule {}
