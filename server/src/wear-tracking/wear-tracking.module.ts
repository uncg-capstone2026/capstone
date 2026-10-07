import { Module } from '@nestjs/common';
import { WearTrackingService } from './wear-tracking.service';

// The hourly wear-tracking job. No routes. ScheduleModule.forRoot() is in
// AppModule; PrismaService comes from the global PrismaModule.
@Module({
  providers: [WearTrackingService],
})
export class WearTrackingModule {}