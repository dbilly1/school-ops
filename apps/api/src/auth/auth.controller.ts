import { Controller, Get, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { StudentLoginDto } from './dto/student-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtPortalGuard } from './guards/jwt-portal.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ── Staff ─────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff login' })
  staffLogin(@Body() dto: LoginDto) {
    return this.authService.staffLogin(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current staff user' })
  staffMe(@CurrentUser() user: any) {
    return this.authService.staffMe(user.id);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh staff access token' })
  staffRefresh(@Body() dto: RefreshTokenDto) {
    return this.authService.staffRefresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Staff logout' })
  staffLogout(@Body() dto: RefreshTokenDto) {
    return this.authService.staffLogout(dto.refreshToken);
  }

  // ── Student Portal ────────────────────────────────────────

  @Post('portal/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Student portal login' })
  portalLogin(@Body() dto: StudentLoginDto) {
    return this.authService.portalLogin(dto);
  }

  @Get('portal/me')
  @UseGuards(JwtPortalGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current portal user' })
  portalMe(@CurrentUser() user: any) {
    return this.authService.portalMe(user.id);
  }

  @Post('portal/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh portal access token' })
  portalRefresh(@Body() dto: RefreshTokenDto) {
    return this.authService.portalRefresh(dto.refreshToken);
  }

  @Post('portal/logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtPortalGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Student portal logout' })
  portalLogout(@Body() dto: RefreshTokenDto) {
    return this.authService.portalLogout(dto.refreshToken);
  }
}
