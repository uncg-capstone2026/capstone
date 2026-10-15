import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ChangePasswordDto, LoginDto, PushTokenDto, SignupDto, UpdateMeDto } from './auth.dto';
import {
  assertStrongPassword,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
} from './auth.utils';
import { isValidTimeZone, parseProfileChanges, readPushToken } from './profile-changes';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly s3: S3Service,
  ) {}

  async signup(body: SignupDto) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new BadRequestException('Name is required');
    if (!isValidEmail(body.email)) throw new BadRequestException('Enter a valid email');
    assertStrongPassword(body.password);

    const email = normalizeEmail(body.email);
    const phone = body.phone ? normalizePhone(body.phone) : null;

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(body.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          name,
          displayName: name,
          email,
          phone,
          passwordHash,
          marketingOptIn: body.marketingOptIn === true,
          // Optional at signup. A missing or invalid zone keeps the default
          // rather than blocking the sign-up; the app sends it again later.
          ...(isValidTimeZone(body.timeZone) ? { timeZone: body.timeZone } : {}),
        },
      });
      return this.buildAuthResponse(user);
    } catch (e) {
      // Catches the rare race where two sign-ups use the same email/phone at once.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String(e.meta?.target ?? '');
        throw new ConflictException(
          target.includes('phone') ? 'Phone number already in use' : 'Email already in use',
        );
      }
      throw e;
    }
  }

  async login(body: LoginDto) {
    let user: User | null;
    if (body.email) {
      user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(body.email) } });
    } else if (body.phone) {
      user = await this.prisma.user.findUnique({ where: { phone: normalizePhone(body.phone) } });
    } else {
      throw new BadRequestException('Email or phone is required');
    }

    const passwordOk =
      !!user?.passwordHash &&
      typeof body.password === 'string' &&
      (await bcrypt.compare(body.password, user.passwordHash));

    // Same message whether the account exists or not, so it can't be used to check emails.
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Incorrect email/phone or password');
    }
    return this.buildAuthResponse(user);
  }

  async me(userId: User['id']) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.toPublicUser(user);
  }

  // PATCH /api/auth/me { name?, email?, displayName?, phone?, timeZone?, notificationsEnabled? }
  // -> the updated user (same shape as GET /api/auth/me). 400 for an empty body,
  // unknown fields or invalid values; 409 if another account already has the
  // email or phone. The login token only holds the user id, so it stays valid
  // after an email change.
  async updateMe(userId: User['id'], body: UpdateMeDto) {
    const changes = parseProfileChanges(body);
    try {
      const user = await this.prisma.user.update({ where: { id: userId }, data: changes });
      return this.toPublicUser(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // Email and phone are the unique fields this route can change.
        if (e.code === 'P2002') {
          const target = String(e.meta?.target ?? '');
          throw new ConflictException(
            target.includes('email') ? 'Email already in use' : 'Phone number already in use',
          );
        }
        if (e.code === 'P2025') throw new UnauthorizedException(); // the account no longer exists
      }
      throw e;
    }
  }

  // POST /api/auth/me/password { currentPassword, newPassword } -> 204.
  // A wrong current password is a 400, not a 401: the app treats any 401 as an
  // expired session and signs the user out.
  async changePassword(userId: User['id'], body: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const currentOk =
      typeof body?.currentPassword === 'string' &&
      (await bcrypt.compare(body.currentPassword, user.passwordHash));
    if (!currentOk) throw new BadRequestException('Your current password is incorrect');

    assertStrongPassword(body.newPassword);
    if (body.newPassword === body.currentPassword) {
      throw new BadRequestException('Choose a password different from your current one');
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  // DELETE /api/auth/me -> 204. Deletes the account and everything in it: items,
  // body photos and their saved try-on images, outfits (with their pieces,
  // calendar days and collection entries), collections, Stylist sessions,
  // feedback, notifications and push tokens, all through the schema's cascades.
  // The photos in S3 go afterwards:
  // the database comes first, so an S3 problem can never leave a half-deleted
  // account, and S3 failures are only logged.
  async deleteAccount(userId: User['id']) {
    const [items, photos, renders] = await Promise.all([
      this.prisma.item.findMany({ where: { userId }, select: { imageKey: true, cutoutKey: true } }),
      this.prisma.tryOnPhoto.findMany({ where: { userId }, select: { imageKey: true } }),
      this.prisma.tryOnRender.findMany({ where: { userId }, select: { imageKey: true } }),
    ]);
    const keys = [
      ...new Set(
        [
          ...items.flatMap((item) => [item.imageKey, item.cutoutKey]),
          ...photos.map((photo) => photo.imageKey),
          ...renders.map((render) => render.imageKey),
        ].filter((key): key is string => !!key),
      ),
    ];

    const { count } = await this.prisma.user.deleteMany({ where: { id: userId } });
    if (count === 0) throw new UnauthorizedException(); // already gone

    const failed = await this.s3.deleteObjects(keys);
    if (failed.length > 0) {
      this.logger.warn(`Account ${userId} deleted, but ${failed.length} of ${keys.length} S3 files weren't: ${failed.join(', ')}`);
    }
  }

  // POST /api/auth/me/push-token { token } -> 204. Saves this device's Expo push
  // token. A user can have several devices. If the token was saved for another
  // account (the phone signed in as someone else), it moves to this one, so the
  // previous account stops getting reminders on that phone.
  async registerPushToken(userId: User['id'], body: PushTokenDto) {
    const token = readPushToken(body);
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token },
      update: { userId },
    });
  }

  private async buildAuthResponse(user: User) {
    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, user: this.toPublicUser(user) };
  }

  // Never send passwordHash back to the app.
  private toPublicUser(user: User) {
    return {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      notificationsEnabled: user.notificationsEnabled,
    };
  }
}