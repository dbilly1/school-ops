import { IsString, IsNumber, IsDateString, IsPositive } from 'class-validator';

export class TransportRecordPaymentDto {
  @IsString()
  studentId!: string;

  @IsNumber()
  @IsPositive()
  amountPaid!: number;

  @IsDateString()
  paymentDate!: string;
}

export class TransportMarkPaidDto {
  @IsString()
  studentId!: string;

  @IsDateString()
  date!: string;
}
