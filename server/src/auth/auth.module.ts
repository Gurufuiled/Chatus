import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginusProfileClient } from './loginus-profile.client';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: {
        expiresIn: parseInt(process.env.JWT_EXPIRES_IN ?? '3600', 10),
      },
    }),
    UploadModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, LoginusProfileClient, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, LoginusProfileClient, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
