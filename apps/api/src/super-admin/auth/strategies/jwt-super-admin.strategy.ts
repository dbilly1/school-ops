import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtSuperAdminPayload {
  sub: string;
  type: 'super-admin';
}

@Injectable()
export class JwtSuperAdminStrategy extends PassportStrategy(Strategy, 'jwt-super-admin') {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtSuperAdminPayload) {
    if (payload.type !== 'super-admin') throw new UnauthorizedException();

    const admin = await this.prisma.superAdmin.findUnique({
      where: { id: payload.sub },
    });

    if (!admin || !admin.isActive) throw new UnauthorizedException();

    return { id: admin.id, email: admin.email, type: 'super-admin' };
  }
}
