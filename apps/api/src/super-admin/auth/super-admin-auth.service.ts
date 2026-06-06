import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';

@Injectable()
export class SuperAdminAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: SuperAdminLoginDto) {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { email: dto.email },
    });

    if (!admin || !admin.isActive)
      throw new UnauthorizedException('Invalid credentials');

    const match = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateTokens(admin);
    return {
      ...tokens,
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
      },
    };
  }

  async refresh(refreshToken: string) {
    const records = await this.prisma.superAdminRefreshToken.findMany({
      where: { expiresAt: { gt: new Date() } },
      include: { superAdmin: true },
    });

    for (const record of records) {
      const match = await bcrypt.compare(refreshToken, record.tokenHash);
      if (match) {
        await this.prisma.superAdminRefreshToken.delete({ where: { id: record.id } });
        return this.generateTokens(record.superAdmin);
      }
    }

    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  async logout(refreshToken: string) {
    const records = await this.prisma.superAdminRefreshToken.findMany({
      where: { expiresAt: { gt: new Date() } },
    });

    for (const record of records) {
      const match = await bcrypt.compare(refreshToken, record.tokenHash);
      if (match) {
        await this.prisma.superAdminRefreshToken.delete({ where: { id: record.id } });
        break;
      }
    }

    return { success: true };
  }

  private async generateTokens(admin: { id: string }) {
    const payload = { sub: admin.id, type: 'super-admin' };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.get('JWT_EXPIRES_IN'),
    });

    const refreshToken = this.generateOpaqueToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.superAdminRefreshToken.create({
      data: {
        superAdminId: admin.id,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private generateOpaqueToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Buffer.from(array).toString('hex');
  }
}
