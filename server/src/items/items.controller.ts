import { Controller, Get, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { ItemsService } from './items.service';

@Controller('items')
@UseGuards(AuthGuard) // every route here needs Authorization: Bearer <token>
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  // GET /api/items -> ClosetItem[] for the logged-in user
  @Get()
  list(@CurrentUserId() userId: User['id']) {
    return this.items.listForUser(userId);
  }
}