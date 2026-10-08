import { Module } from '@nestjs/common';
import { OutfitsModule } from '../outfits/outfits.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

// The Calendar tab: GET /api/calendar. Uses OutfitsService to shape each day's
// outfit. PrismaService comes from the global PrismaModule.
@Module({
  imports: [OutfitsModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}