import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuthGuard, CurrentUserId } from './auth.guard';
import { LoginDto, PushTokenDto, SignupDto, UpdateMeDto } from './auth.dto';

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

  // PATCH /api/auth/me { name?, displayName?, phone?, timeZone?, notificationsEnabled? }  (needs Authorization)
  //   -> 200, the updated user (same shape as GET /api/auth/me)
  // 400 for an empty body or invalid values, 409 if the phone number is taken.
  @Patch('me')
  @UseGuards(AuthGuard)
  updateMe(@CurrentUserId() userId: User['id'], @Body() body: UpdateMeDto) {
    return this.auth.updateMe(userId, body);
  }

  // POST /api/auth/me/push-token { token }  (needs Authorization) -> 204
  // Saves this device's Expo push token for reminders. 400 if it isn't one.
  @Post('me/push-token')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  registerPushToken(@CurrentUserId() userId: User['id'], @Body() body: PushTokenDto) {
    return this.auth.registerPushToken(userId, body);
  }
}