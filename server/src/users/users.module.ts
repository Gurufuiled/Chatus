import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AddressBookService } from './address-book.service';
import { PhoneChangeService } from './phone-change.service';
import { PushModule } from '../push/push.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PushModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService, AddressBookService, PhoneChangeService],
  exports: [UsersService],
})
export class UsersModule {}
