import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AddressBookService } from './address-book.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule],
  controllers: [UsersController],
  providers: [UsersService, AddressBookService],
  exports: [UsersService],
})
export class UsersModule {}
