import { Controller, Get, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { CalendarRangeDto } from './calendar.dto';
import { CalendarService } from './calendar.service';

@Controller('calendar')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  // GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
  //   -> [{ id, date, eventName, outfit }], earliest first, both days included.
  @Get()
  range(
    @CurrentUserId() userId: User['id'],
    @Query(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) query: CalendarRangeDto,
  ) {
    return this.calendar.range(userId, query.from, query.to);
  }
}