import { IsString, IsInt, IsDateString, IsOptional, Min } from 'class-validator';

export class TransportMarkPaidDto {
  @IsString()
  studentId!: string;

  @IsDateString()
  date!: string;
}

// Top up a student's prepaid transport balance by a number of days.
// Amount is derived server-side from the student's route dailyRate.
export class TransportPrepayDto {
  @IsString()
  studentId!: string;

  @IsInt()
  @Min(1)
  days!: number;

  @IsDateString()
  @IsOptional()
  paymentDate?: string;
}

// Refund unconsumed prepaid days back off a student's balance.
export class TransportRefundDto {
  @IsString()
  studentId!: string;

  @IsInt()
  @Min(1)
  days!: number;
}
