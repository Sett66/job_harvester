import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  llmDebugRequestSchema,
  type LlmCallLogDto,
  type LlmDebugResponse,
  type LlmPromptInfo,
} from '@job-harvester/shared';
import { LlmService } from './llm.service';
import { getPromptByName, listPromptInfo } from './prompts/registry';

@Controller('llm')
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Get('prompts')
  listPrompts(): LlmPromptInfo[] {
    return listPromptInfo();
  }

  @Get('logs')
  listLogs(): LlmCallLogDto[] {
    return this.llmService.getCallLogs();
  }

  @Post('debug')
  @HttpCode(HttpStatus.OK)
  async debug(@Body() body: unknown): Promise<LlmDebugResponse> {
    const parsed = llmDebugRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const prompt = getPromptByName(parsed.data.promptName);
    if (!prompt) {
      throw new BadRequestException(`未知 prompt：${parsed.data.promptName}`);
    }

    const result = await this.llmService.completeJson({
      promptName: prompt.name,
      system: prompt.system,
      user: prompt.buildUser(parsed.data.text),
      schema: prompt.schema,
    });

    const logs = this.llmService.getCallLogs();
    const log = logs[0] ?? {
      promptName: prompt.name,
      durationMs: 0,
      success: result.ok,
      error: result.ok ? undefined : result.error,
      createdAt: new Date().toISOString(),
    };

    if (result.ok) {
      return {
        ok: true,
        data: result.data,
        raw: result.raw,
        redactedUser: result.redactedUser,
        log,
      };
    }

    return {
      ok: false,
      error: result.error,
      raw: result.raw,
      redactedUser: result.redactedUser,
      log,
    };
  }
}
