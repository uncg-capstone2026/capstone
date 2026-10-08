import { Module } from '@nestjs/common';
import { S3Module } from '../s3/s3.module';
import { OutfitsController } from './outfits.controller';
import { OutfitsService } from './outfits.service';

// Saved outfits: /api/outfits. OutfitsService is exported so the Stylist accept
// route (and collections) can reuse create() and toSavedOutfit().
// PrismaService comes from the global PrismaModule.
@Module({
  imports: [S3Module],
  controllers: [OutfitsController],
  providers: [OutfitsService],
  exports: [OutfitsService],
})
export class OutfitsModule {}