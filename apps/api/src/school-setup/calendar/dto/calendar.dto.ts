import { IsString, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { CalendarEventType } from '@prisma/client';

export class CreateCalendarEventDto {
  @IsEnum(CalendarEventType)
  eventType!: CalendarEventType;

  @IsString()
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;
}

export class ConfirmHolidayDto {
  @IsString()
  calendarEventId!: string;
}
