import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Keep stack traces off the wire; AllExceptionsFilter formats responses.
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('port')!;
  const isProduction = config.get<boolean>('isProduction')!;

  // Fail fast rather than booting with a guessable signing key.
  for (const key of ['auth.accessSecret', 'auth.refreshSecret'] as const) {
    const value = config.get<string>(key);
    if (!value || value.length < 24) {
      logger.error(`${key} is missing or too short. Set it in backend/.env.`);
      process.exit(1);
    }
    if (isProduction && value.startsWith('dev-only-')) {
      logger.error(`${key} still holds the development placeholder. Set a real secret.`);
      process.exit(1);
    }
  }

  await mkdir(resolve(config.get<string>('uploads.dir')!), { recursive: true });

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(compression());
  app.use(
    helmet({
      // The API serves JSON and file downloads only; the SPA is served separately.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  const corsOrigins = config.get<string[]>('corsOrigins')!;
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // DTO-less generic CRUD bodies must pass through untouched.
      whitelist: false,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // Authentication is on by default; @Public() opts a route out.
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));

  if (!isProduction) {
    const swagger = new DocumentBuilder()
      .setTitle('GrantOS API')
      .setDescription('Standalone backend replacing the Base44 hosted platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));
  }

  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  logger.log(`GrantOS API listening on http://localhost:${port}/api`);
  logger.log(`Health:  http://localhost:${port}/api/health`);
  if (!isProduction) logger.log(`Swagger: http://localhost:${port}/api/docs`);
  logger.log(`CORS origins: ${corsOrigins.join(', ')}`);
}

void bootstrap();
