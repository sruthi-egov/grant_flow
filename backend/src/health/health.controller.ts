import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { MailerService } from '../notifications/mailer.service';

/**
 * Health endpoints.
 *  /api/health/live   — process is up (used by the container healthcheck)
 *  /api/health/ready  — dependencies are reachable
 *  /api/health        — full status, including which optional integrations are configured
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', uptime_seconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  async ready() {
    const database = await this.checkDatabase();
    const ready = database.status === 'ok';
    return { status: ready ? 'ok' : 'degraded', database };
  }

  @Get()
  async full() {
    const database = await this.checkDatabase();
    return {
      status: database.status === 'ok' ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '1.0.0',
      environment: this.config.get<string>('nodeEnv'),
      uptime_seconds: Math.round(process.uptime()),
      dependencies: {
        database,
        // Optional integrations are reported separately: a missing AI key must
        // not make the service look unhealthy.
        email: { required: false, ...this.mailer.status },
        ai: { required: false, ...this.ai.status },
      },
      base44: {
        // Nothing in this build talks to Base44.
        sdk_present: false,
        outbound_calls: 'none',
      },
    };
  }

  private async checkDatabase() {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' as const, latency_ms: Date.now() - started };
    } catch (error: any) {
      return {
        status: 'error' as const,
        latency_ms: Date.now() - started,
        message: error?.message ?? String(error),
      };
    }
  }
}
