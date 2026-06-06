import { IsString, IsOptional, IsNumber, IsInt, IsPositive, Min } from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  plateNumber!: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  capacity?: number;
}

export class CreateRouteDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  dailyRate!: number;

  @IsString()
  @IsOptional()
  vehicleId?: string;

  @IsString()
  @IsOptional()
  driverId?: string;
}

export class UpdateRouteDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  dailyRate?: number;

  @IsString()
  @IsOptional()
  vehicleId?: string;

  @IsString()
  @IsOptional()
  driverId?: string;
}

export class CreateDriverDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  licenseNo?: string;
}

export class AddPickupPointDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  sequence!: number;
}

export class AssignStudentToRouteDto {
  @IsString()
  studentId!: string;

  @IsString()
  transportRouteId!: string;

  @IsString()
  @IsOptional()
  pickupPointId?: string;
}
