import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../db/database.module';
import { ApplicationsModule } from '../applications/applications.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [DatabaseModule, ApplicationsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
