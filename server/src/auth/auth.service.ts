import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, SignupDto, UpdateMeDto } from './auth.dto';
import {
  assertStrongPassword,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
} from './auth.utils';
import { isValidTimeZone, parseProfileChanges } from './profile-changes';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
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

  // PATCH /api/auth/me { name?, displayName?, phone?, timeZone? } -> the updated
  // user (same shape as GET /api/auth/me). 400 for an empty body, unknown fields
  // or invalid values; 409 if another account already has the phone number.
  async updateMe(userId: User['id'], body: UpdateMeDto) {
    const changes = parseProfileChanges(body);
    try {
      const user = await this.prisma.user.update({ where: { id: userId }, data: changes });
      return this.toPublicUser(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // Phone is the only unique field this route can change.
        if (e.code === 'P2002') throw new ConflictException('Phone number already in use');
        if (e.code === 'P2025') throw new UnauthorizedException(); // the account no longer exists
      }
      throw e;
    }
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
    };
  }
}