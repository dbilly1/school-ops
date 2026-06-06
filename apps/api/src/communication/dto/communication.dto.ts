import { IsString, IsOptional } from 'class-validator';

export class CreateNoticeDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;
}

export class CreateAnnouncementDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;
}
