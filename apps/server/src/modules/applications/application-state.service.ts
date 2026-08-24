import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Application } from '@job-harvester/shared';
import { eq } from 'drizzle-orm';
import { DATABASE, type AppDatabase } from '../../db/database.provider';
import { application } from '../../db/schema';
import {
  recomputeAllApplications,
  recomputeApplicationById,
} from './application-recompute';

@Injectable()
export class ApplicationStateService {
  constructor(@Inject(DATABASE) private readonly db: AppDatabase) {}

  async recomputeApplication(applicationId: string): Promise<Application> {
    const rows = await this.db
      .select({ id: application.id })
      .from(application)
      .where(eq(application.id, applicationId))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException('投递记录不存在');
    }
    return recomputeApplicationById(this.db, applicationId);
  }

  async recomputeAll(): Promise<number> {
    return recomputeAllApplications(this.db);
  }
}
