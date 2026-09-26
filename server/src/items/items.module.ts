import { Module } from '@nestjs/common';
import { S3Module } from '../s3/s3.module';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  imports: [S3Module],
  controllers: [ItemsController],
  providers: [ItemsService],
})
export class ItemsModule {}