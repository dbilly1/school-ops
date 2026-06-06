import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtPortalGuard extends AuthGuard('jwt-portal') {}
