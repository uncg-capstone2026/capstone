import { Matches } from 'class-validator';

// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD. Both required. The service
// also checks they're real dates and that from isn't after to.
export class CalendarRangeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be in YYYY-MM-DD format' })
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be in YYYY-MM-DD format' })
  to!: string;
}