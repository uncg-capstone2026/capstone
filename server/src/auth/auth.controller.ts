import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuthGuard, CurrentUserId } from './auth.guard';
import { LoginDto, SignupDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // POST /api/auth/signup  -> 201 { token, user }
  @Post('signup')
  signup(@Body() body: SignupDto) {
    return this.auth.signup(body);
  }

  // POST /api/auth/login  -> 200 { token, user }
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }

  // GET /api/auth/me  (needs Authorization: Bearer <token>) -> the logged-in user
  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUserId() userId: User['id']) {
    return this.auth.me(userId);
  }
}