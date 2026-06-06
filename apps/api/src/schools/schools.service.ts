import { Injectable, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { PackagesService } from '../super-admin/packages/packages.service';
import { AuthService } from '../auth/auth.service';
import { RegisterSchoolDto } from './dto/register-school.dto';

@Injectable()
export class SchoolsService {
  constructor(
    private prisma: PrismaService,
    private packagesService: PackagesService,
    private authService: AuthService,
  ) {}

  async register(dto: RegisterSchoolDto) {
    // Check email not already in use
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.ownerEmail },
    });
    if (existingUser) throw new ConflictException('Email already registered');

    // Get or create the dev all-features package
    const packageId = await this.packagesService.ensureDevPackage();

    const passwordHash = await bcrypt.hash(dto.ownerPassword, 10);

    const { school, owner } = await this.prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: dto.schoolName,
          country: dto.country,
          address: dto.address ?? null,
          phone: dto.phone ?? null,
          packageId,
          subscriptionState: 'TRIAL',
        },
      });

      const owner = await tx.user.create({
        data: {
          schoolId: school.id,
          email: dto.ownerEmail,
          passwordHash,
          firstName: dto.ownerFirstName,
          lastName: dto.ownerLastName,
          roles: {
            create: { role: 'SCHOOL_OWNER' },
          },
        },
        include: { roles: true },
      });

      return { school, owner };
    });

    // Issue tokens immediately so the frontend can enter the app without a separate login
    const tokens = await this.authService.generateStaffTokens(owner);

    return {
      ...tokens,
      user: {
        id: owner.id,
        schoolId: school.id,
        email: owner.email,
        firstName: owner.firstName,
        lastName: owner.lastName,
        roles: owner.roles.map((r) => r.role),
      },
    };
  }
}
