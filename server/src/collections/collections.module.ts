import { Module } from '@nestjs/common';
import { OutfitsModule } from '../outfits/outfits.module';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';

// The Outfits tab: /api/collections. Uses OutfitsService to turn outfits into the
// app's shape (covers and outfit lists). PrismaService comes from the global PrismaModule.
@Module({
  imports: [OutfitsModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}