import { IsString, IsNumber, IsDateString, IsPositive, IsOptional } from 'class-validator';

export class EnrollStudentDto {
  @IsString()
  studentId!: string;

  @IsString()
  academicYearId!: string;
}

export class RecordPaymentDto {
  @IsString()
  studentId!: string;

  // Accept both "amount" (frontend) and "amountPaid" (legacy)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  @IsOptional()
  paymentDate?: string;
}

export class MarkPaidDto {
  @IsString()
  studentId!: string;

  @IsDateString()
  date!: string;
}
