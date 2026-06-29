import { IsString, IsInt, IsNumber, IsDateString, IsOptional, Min } from 'class-validator';

// Record the actual cash counted in the drawer at end of day for the feeding
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

export class EnrollStudentDto {
  @IsString()
  studentId!: string;

  @IsString()
  academicYearId!: string;
}

// Exempt/include a student for the active academic year (resolved server-side).
export class FeedingExemptDto {
  @IsString()
  studentId!: string;
}

export class MarkPaidDto {
  @IsString()
  studentId!: string;

  @IsDateString()
  date!: string;
}

// Top up a student's prepaid feeding balance by a number of days.
export class FeedingPrepayDto {
  @IsString()
  studentId!: string;

  @IsInt()
  @Min(1)
  days!: number;

  @IsDateString()
  @IsOptional()
  paymentDate?: string;
}

// Refund unconsumed prepaid days off a student's balance.
export class FeedingRefundDto {
  @IsString()
  studentId!: string;

  @IsInt()
  @Min(1)
  days!: number;
}

// Settle outstanding (UNPAID) feeding days. Omit `days` to clear all arrears.
export class FeedingSettleArrearsDto {
  @IsString()
  studentId!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  days?: number;
}
