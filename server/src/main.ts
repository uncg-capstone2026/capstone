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