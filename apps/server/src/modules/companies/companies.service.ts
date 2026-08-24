import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createCompanySchema, type Company } from '@job-harvester/shared';
import { asc, eq } from 'drizzle-orm';
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

    return rows.map((row) => this.toCompany(row));
  }

  async findById(id: string): Promise<Company | null> {
    const rows = await this.db
      .select()
      .from(company)
      .where(eq(company.id, id))
      .limit(1);

    const row = rows[0];
    return row ? this.toCompany(row) : null;
  }

  async findByName(canonicalName: string): Promise<Company | null> {
    const rows = await this.db
      .select()
      .from(company)
      .where(eq(company.canonicalName, canonicalName.trim()))
      .limit(1);

    const row = rows[0];
    return row ? this.toCompany(row) : null;
  }

  async findOrCreateByName(canonicalName: string): Promise<Company> {
    const existing = await this.findByName(canonicalName);
    if (existing) {
      return existing;
    }
    return this.create({ canonicalName: canonicalName.trim() });
  }

  async create(input: unknown): Promise<Company> {
    const parsed = createCompanySchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const now = new Date();
    const row = {
      id: uuidv4(),
      canonicalName: parsed.data.canonicalName.trim(),
      industry: parsed.data.industry?.trim() ?? null,
      website: parsed.data.website?.trim() ?? null,
      note: parsed.data.note?.trim() ?? null,
      createdAt: now,
    };

    await this.db.insert(company).values(row);

    return this.toCompany(row);
  }

  private toCompany(row: typeof company.$inferSelect): Company {
    return {
      id: row.id,
      canonicalName: row.canonicalName,
      industry: row.industry ?? null,
      website: row.website ?? null,
      note: row.note ?? null,
      createdAt: row.createdAt,
    };
  }
}
