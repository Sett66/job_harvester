import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../db/database.module';
import {
  createKeytarCredentialsStore,
  MAIL_CREDENTIALS_STORE,
} from './credentials';
import { ImapflowMailboxConnector, MAILBOX_CONNECTOR } from './imap.client';
import { MailController } from './mail.controller';
import { ScreenService } from './screen.service';
import { MailSyncService } from './sync.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MailController],
  providers: [
    MailSyncService,
    ScreenService,
    {
      provide: MAIL_CREDENTIALS_STORE,
      useFactory: createKeytarCredentialsStore,
    },
    {
      provide: MAILBOX_CONNECTOR,
      useClass: ImapflowMailboxConnector,
    },
  ],
  exports: [MailSyncService, ScreenService],
})
export class MailModule {}
