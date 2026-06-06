import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SuperAdminAuthService } from './super-admin-auth.service';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';
import { RefreshTokenDto } from '../../auth/dto/refresh-token.dto';
import { JwtSuperAdminGuard } from './guards/jwt-super-admin.guard';

@ApiTags('Super Admin — Auth')
@Controller('super-admin/auth')
export class SuperAdminAuthController {
  constructor(private authService: SuperAdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Super Admin login' })
  login(@Body() dto: SuperAdminLoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh Super Admin access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtSuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Super Admin logout' })
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }
}
