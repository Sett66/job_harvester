import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { createCompanySchema, type Company } from '@job-harvester/shared';
import { asc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE, type AppDatabase } from '../../db/database.provider';
import { company } from '../../db/schema';

@Injectable()
export class CompaniesService {
  constructor(@Inject(DATABASE) private readonly db: AppDatabase) {}

  async findAll(): Promise<Company[]> {
    const rows = await this.db
      .select()
      .from(company)
      .orderBy(asc(company.canonicalName));

    return rows.map((row) => ({
      id: row.id,
      canonicalName: row.canonicalName,
      industry: row.industry ?? null,
      website: row.website ?? null,
      note: row.note ?? null,
      createdAt: row.createdAt,
    }));
  }

  async create(input: unknown): Promise<Company> {
    const parsed = createCompanySchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const now = new Date();
    const row = {
      id: uuidv4(),
      canonicalName: parsed.data.canonicalName,
      industry: parsed.data.industry ?? null,
      website: parsed.data.website ?? null,
      note: parsed.data.note ?? null,
      createdAt: now,
    };

    await this.db.insert(company).values(row);

    return {
      id: row.id,
      canonicalName: row.canonicalName,
      industry: row.industry,
      website: row.website,
      note: row.note,
      createdAt: row.createdAt,
    };
  }
}
