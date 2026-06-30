import { IsString, IsInt, IsNumber, IsDateString, IsOptional, IsIn, Min } from 'class-validator';

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

  // Which leg to collect cash for. Omit to settle every unpaid leg that day
  // (used by the per-student payment calendar).
  @IsIn(['AM', 'PM'])
  @IsOptional()
  leg?: 'AM' | 'PM';
}

// Mark every unmarked leg on a route as ridden for the day (fast path).
export class TransportMarkAllBoardingDto {
  @IsString()
  routeId!: string;

  @IsDateString()
  date!: string;
}

// Set a student's status for a given leg.
//   rode  — boarded: consumes a prepaid leg if available, else accrues as unpaid
//   off   — explicitly marked as not riding this leg (no charge; frees prepaid)
//   clear — back to unmarked (not yet checked)
export class TransportMarkBoardingDto {
  @IsString()
  studentId!: string;

  @IsDateString()
  date!: string;

  @IsIn(['AM', 'PM'])
  leg!: 'AM' | 'PM';

  @IsIn(['rode', 'off', 'clear'])
  action!: 'rode' | 'off' | 'clear';
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
