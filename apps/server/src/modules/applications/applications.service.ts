import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BALL_LABELS,
  compareTodayTodos,
  computeStaleness,
  createApplicationSchema,
  createCompanyAliasSchema,
  getBoardColumnKey,
  isDeadlinePriorityTodo,
  isOpenTodayTodo,
  STAGE_LABELS,
  updateApplicationSchema,
  type Application,
  type ApplicationGrouped,
  type BoardApplicationItem,
  type BoardColumn,
  type BoardColumnKey,
  type BoardCompanyGroup,
  type BoardView,
  type CompanyAlias,
  type CreateApplicationInput,
  type CreateApplicationResponse,
  type CreateCompanyAliasInput,
  type StaleApplicationItem,
  type TodayTodoItem,
  type TodayView,
  type UpdateApplicationInput,
} from '@job-harvester/shared';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getStalenessThresholds } from '../../config/staleness.config';
import { DATABASE, type AppDatabase } from '../../db/database.provider';
import { application, companyAlias, event } from '../../db/schema';
import { CompaniesService } from '../companies/companies.service';

function normalizeOptionalText(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compareApplicationsByLastEventAtDesc(
  left: Pick<Application, 'lastEventAt'>,
  right: Pick<Application, 'lastEventAt'>,
): number {
  return right.lastEventAt.getTime() - left.lastEventAt.getTime();
}

function latestLastEventAt(apps: Pick<Application, 'lastEventAt'>[]): number {
  return apps.reduce(
    (latest, app) => Math.max(latest, app.lastEventAt.getTime()),
    0,
  );
}

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly companiesService: CompaniesService,
  ) {}

  async findById(id: string): Promise<Application> {
    const rows = await this.db
      .select()
      .from(application)
      .where(eq(application.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('投递记录不存在');
    }
    return this.toApplication(row);
  }

  async findGrouped(): Promise<ApplicationGrouped[]> {
    const companies = await this.companiesService.findAll();
    const applications = await this.db
      .select()
      .from(application)
      .orderBy(desc(application.lastEventAt));

    const grouped = new Map<string, ApplicationGrouped>();

    for (const companyRecord of companies) {
      grouped.set(companyRecord.id, {
        company: companyRecord,
        applications: [],
      });
    }

    for (const row of applications) {
      const group = grouped.get(row.companyId);
      if (!group) {
        continue;
      }
      group.applications.push(this.toApplication(row));
    }

    return [...grouped.values()]
      .filter((group) => group.applications.length > 0)
      .map((group) => ({
        ...group,
        applications: [...group.applications].sort(
          compareApplicationsByLastEventAtDesc,
        ),
      }))
      .sort(
        (left, right) =>
          latestLastEventAt(right.applications) -
          latestLastEventAt(left.applications),
      );
  }

  async findBoard(): Promise<BoardView> {
    const thresholds = getStalenessThresholds();
    const companies = await this.companiesService.findAll();
    const companyMap = new Map(
      companies.map((company) => [company.id, company]),
    );
    const rows = await this.db
      .select()
      .from(application)
      .orderBy(desc(application.lastEventAt));

    const columnGroups = new Map<BoardColumnKey, Map<string, BoardApplicationItem[]>>(
      [
        ['ME', new Map()],
        ['THEM', new Map()],
        ['OFFER', new Map()],
        ['CLOSED', new Map()],
      ],
    );

    for (const row of rows) {
      const app = this.toApplication(row);
      const company = companyMap.get(app.companyId);
      if (!company) {
        continue;
      }

      const columnKey = getBoardColumnKey(app);
      const item: BoardApplicationItem = {
        ...app,
        staleness: computeStaleness(
          {
            ball: app.ball ?? null,
            stage: app.stage,
            lastEventAt: app.lastEventAt,
          },
          { thresholds },
        ),
      };
      const groups = columnGroups.get(columnKey)!;
      const existing = groups.get(company.id) ?? [];
      existing.push(item);
      groups.set(company.id, existing);
    }

    const columnLabels: Record<BoardColumnKey, string> = {
      ME: BALL_LABELS.ME,
      THEM: BALL_LABELS.THEM,
      OFFER: STAGE_LABELS.OFFER,
      CLOSED: STAGE_LABELS.CLOSED,
    };

    const columns: BoardColumn[] = (['ME', 'THEM', 'OFFER', 'CLOSED'] as const).map(
      (key) => {
        const groups: BoardCompanyGroup[] = [...columnGroups.get(key)!.entries()]
          .map(([companyId, applications]) => ({
            company: companyMap.get(companyId)!,
            applications: [...applications].sort(compareApplicationsByLastEventAtDesc),
          }))
          .sort(
            (left, right) =>
              latestLastEventAt(right.applications) -
              latestLastEventAt(left.applications),
          );

        return {
          key,
          label: columnLabels[key],
          groups,
        };
      },
    );

    return { columns, thresholds };
  }

  async findToday(): Promise<TodayView> {
    const thresholds = getStalenessThresholds();
    const companies = await this.companiesService.findAll();
    const companyNames = new Map(
      companies.map((company) => [company.id, company.canonicalName]),
    );
    const rows = await this.db
      .select()
      .from(application)
      .orderBy(asc(application.updatedAt));

    const todos: TodayTodoItem[] = [];
    const staleItems: StaleApplicationItem[] = [];

    for (const row of rows) {
      const app = this.toApplication(row);
      const companyName = companyNames.get(app.companyId) ?? '未知公司';

      if (isOpenTodayTodo(app)) {
        todos.push({
          ...app,
          companyName,
          isDeadlinePriority: isDeadlinePriorityTodo(app),
        });
      }

      const staleness = computeStaleness(
        {
          ball: app.ball ?? null,
          stage: app.stage,
          lastEventAt: app.lastEventAt,
        },
        { thresholds },
      );
      if (staleness?.isStale) {
        staleItems.push({
          ...app,
          companyName,
          staleness,
        });
      }
    }

    todos.sort(compareTodayTodos);
    staleItems.sort(
      (left, right) => right.staleness.staleDays - left.staleness.staleDays,
    );

    return { todos, staleItems, thresholds };
  }

  async archiveAsAssumedDead(id: string): Promise<Application> {
    return this.update(id, {
      stage: 'CLOSED',
      ball: null,
      outcome: 'ASSUMED_DEAD',
    });
  }

  async create(input: unknown): Promise<CreateApplicationResponse> {
    const parsed = createApplicationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const data = parsed.data;
    let companyId = data.companyId;

    if (!companyId) {
      const createdCompany = await this.companiesService.findOrCreateByName(
        data.companyName!.trim(),
      );
      companyId = createdCompany.id;
    } else {
      const existingCompany = await this.companiesService.findById(companyId);
      if (!existingCompany) {
        throw new NotFoundException('公司不存在');
      }
    }

    const businessUnit = normalizeOptionalText(data.businessUnit);
    const duplicateWarning = await this.buildDuplicateWarning(
      companyId,
      businessUnit,
      data.batch,
    );

    const now = new Date();
    const row = {
      id: uuidv4(),
      companyId,
      businessUnit,
      position: normalizeOptionalText(data.position),
      batch: data.batch.trim(),
      channel: data.channel ?? null,
      appliedAt: data.appliedAt ?? null,
      stage: data.stage,
      ball: data.ball ?? null,
      outcome: data.outcome ?? null,
      currentRound: data.currentRound ?? 0,
      currentInterviewType: data.currentInterviewType ?? null,
      lastEventAt: data.appliedAt ?? now,
      nextDeadlineAt: data.nextDeadlineAt ?? null,
      note: normalizeOptionalText(data.note),
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(application).values(row);

    return {
      application: this.toApplication(row),
      duplicateWarning,
    };
  }

  async update(id: string, input: unknown): Promise<Application> {
    const parsed = updateApplicationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existingRows = await this.db
      .select()
      .from(application)
      .where(eq(application.id, id))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      throw new NotFoundException('投递记录不存在');
    }

    const data = parsed.data;
    const nextStage = data.stage ?? existing.stage;
    const nextBall =
      data.ball !== undefined ? data.ball : existing.ball;
    const nextOutcome =
      data.outcome !== undefined ? data.outcome : existing.outcome;

    if (nextStage === 'OFFER' || nextStage === 'CLOSED') {
      if (nextBall != null) {
        throw new BadRequestException('OFFER 与 CLOSED 环节下 ball 必须为空');
      }
    }
    if (nextStage !== 'CLOSED' && nextOutcome != null) {
      throw new BadRequestException('outcome 仅在 CLOSED 环节下有效');
    }

    const updated = {
      businessUnit:
        data.businessUnit !== undefined
          ? normalizeOptionalText(data.businessUnit)
          : existing.businessUnit,
      position:
        data.position !== undefined
          ? normalizeOptionalText(data.position)
          : existing.position,
      batch: data.batch?.trim() ?? existing.batch,
      channel: data.channel !== undefined ? data.channel ?? null : existing.channel,
      appliedAt:
        data.appliedAt !== undefined ? data.appliedAt : existing.appliedAt,
      stage: nextStage,
      ball: nextBall,
      outcome: nextOutcome,
      currentRound: data.currentRound ?? existing.currentRound,
      currentInterviewType:
        data.currentInterviewType !== undefined
          ? data.currentInterviewType
          : existing.currentInterviewType,
      nextDeadlineAt:
        data.nextDeadlineAt !== undefined
          ? data.nextDeadlineAt
          : existing.nextDeadlineAt,
      note:
        data.note !== undefined
          ? normalizeOptionalText(data.note)
          : existing.note,
      updatedAt: new Date(),
    };

    await this.db
      .update(application)
      .set(updated)
      .where(eq(application.id, id));

    return this.toApplication({ ...existing, ...updated });
  }

  async remove(id: string): Promise<void> {
    const existingRows = await this.db
      .select()
      .from(application)
      .where(eq(application.id, id))
      .limit(1);
    if (!existingRows[0]) {
      throw new NotFoundException('投递记录不存在');
    }

    await this.db.delete(event).where(eq(event.applicationId, id));
    await this.db.delete(application).where(eq(application.id, id));
  }

  async listAliases(companyId: string): Promise<CompanyAlias[]> {
    await this.ensureCompanyExists(companyId);
    const rows = await this.db
      .select()
      .from(companyAlias)
      .where(eq(companyAlias.companyId, companyId))
      .orderBy(asc(companyAlias.alias));

    return rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      alias: row.alias,
      source: row.source as CompanyAlias['source'],
    }));
  }

  async createAlias(
    companyId: string,
    input: unknown,
  ): Promise<CompanyAlias> {
    await this.ensureCompanyExists(companyId);
    const parsed = createCompanyAliasSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const row = {
      id: uuidv4(),
      companyId,
      alias: parsed.data.alias.trim(),
      source: parsed.data.source,
    };

    await this.db.insert(companyAlias).values(row);

    return row;
  }

  async removeAlias(companyId: string, aliasId: string): Promise<void> {
    await this.ensureCompanyExists(companyId);
    const rows = await this.db
      .select()
      .from(companyAlias)
      .where(
        and(eq(companyAlias.id, aliasId), eq(companyAlias.companyId, companyId)),
      )
      .limit(1);

    if (!rows[0]) {
      throw new NotFoundException('别名不存在');
    }

    await this.db.delete(companyAlias).where(eq(companyAlias.id, aliasId));
  }

  private async ensureCompanyExists(companyId: string): Promise<void> {
    const existing = await this.companiesService.findById(companyId);
    if (!existing) {
      throw new NotFoundException('公司不存在');
    }
  }

  private async buildDuplicateWarning(
    companyId: string,
    businessUnit: string | null,
    batch: string,
  ): Promise<string | null> {
    const duplicates = await this.db
      .select({ id: application.id })
      .from(application)
      .where(
        and(
          eq(application.companyId, companyId),
          eq(application.batch, batch.trim()),
          businessUnit
            ? eq(application.businessUnit, businessUnit)
            : isNull(application.businessUnit),
        ),
      );

    if (duplicates.length === 0) {
      return null;
    }

    const businessUnitLabel = businessUnit ?? '（无业务线）';
    return `已存在相同投递：公司 + 业务线「${businessUnitLabel}」+ 批次「${batch.trim()}」`;
  }

  private toApplication(row: typeof application.$inferSelect): Application {
    return {
      id: row.id,
      companyId: row.companyId,
      businessUnit: row.businessUnit ?? null,
      position: row.position ?? null,
      batch: row.batch,
      channel: (row.channel as Application['channel']) ?? null,
      appliedAt: row.appliedAt ?? null,
      stage: row.stage as Application['stage'],
      ball: (row.ball as Application['ball']) ?? null,
      outcome: (row.outcome as Application['outcome']) ?? null,
      currentRound: row.currentRound,
      currentInterviewType:
        (row.currentInterviewType as Application['currentInterviewType']) ??
        null,
      lastEventAt: row.lastEventAt,
      nextDeadlineAt: row.nextDeadlineAt ?? null,
      note: row.note ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
