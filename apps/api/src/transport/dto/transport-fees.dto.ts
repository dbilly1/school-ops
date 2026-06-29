import { IsString, IsInt, IsNumber, IsDateString, IsOptional, Min } from 'class-validator';

// Record the actual cash counted in the drawer at end of day for the transport
// stream. Expected/variance are computed server-side and snapshotted.
export class RecordCashCountDto {
  @IsDateString()
  date!: string;

  @IsNumber()
  @Min(0)
  countedCash!: number;

  @IsString()
  @IsOptional()
  note?: string;
}

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

// Settle outstanding (UNPAID) ride days. Omit `days` to clear all arrears;
// pass it to part-settle the oldest N days.
export class TransportSettleArrearsDto {
  @IsString()
  studentId!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  days?: number;
}
