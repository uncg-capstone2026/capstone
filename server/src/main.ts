// Loads server/.env into process.env before anything else is imported, so code
// that reads process.env when its file loads (e.g. GeminiHelpers and
// GEMINI_API_KEY) sees the values. This is the only place .env is loaded;
// ConfigModule in app.module.ts is told not to load it again. On Railway there's
// no .env file and the variables come from its settings.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { AppModule } from './app.module';
import { loggerConfig } from './logger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: WinstonModule.createLogger(loggerConfig) });
  app.setGlobalPrefix('api');
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();