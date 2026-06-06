import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPortalPayload {
  sub: string;
  schoolId: string;
  type: 'portal';
}

@Injectable()
export class JwtPortalStrategy extends PassportStrategy(Strategy, 'jwt-portal') {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPortalPayload) {
    if (payload.type !== 'portal') throw new UnauthorizedException();

    const student = await this.prisma.student.findUnique({
      where: { id: payload.sub },
    });

    if (!student) throw new UnauthorizedException();

    return {
      id: student.id,
      schoolId: student.schoolId,
      studentId: student.studentId,
    };
  }
}
