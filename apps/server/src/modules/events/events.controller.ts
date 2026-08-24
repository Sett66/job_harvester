import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type Application,
  type CreateEventInput,
  type Event,
  type UpdateEventInput,
} from '@job-harvester/shared';
import { EventsService } from './events.service';

@Controller('applications/:applicationId/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(@Param('applicationId') applicationId: string): Promise<Event[]> {
    return this.eventsService.findByApplication(applicationId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('applicationId') applicationId: string,
    @Body() body: CreateEventInput,
  ): Promise<{ event: Event; application: Application }> {
    return this.eventsService.create(applicationId, body);
  }

  @Patch(':eventId')
  update(
    @Param('applicationId') applicationId: string,
    @Param('eventId') eventId: string,
    @Body() body: UpdateEventInput,
  ): Promise<{ event: Event; application: Application }> {
    return this.eventsService.update(applicationId, eventId, body);
  }

  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('applicationId') applicationId: string,
    @Param('eventId') eventId: string,
  ): Promise<void> {
    await this.eventsService.remove(applicationId, eventId);
  }
}
