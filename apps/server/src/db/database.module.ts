import { Module } from '@nestjs/common';
import { DATABASE, databaseProvider } from './database.provider';

@Module({
  providers: [databaseProvider],
  exports: [DATABASE],
})
export class DatabaseModule {}
