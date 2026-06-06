import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtSuperAdminGuard extends AuthGuard('jwt-super-admin') {}
