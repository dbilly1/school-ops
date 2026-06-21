import { IsString, Matches } from 'class-validator';

export class SetStudentIdPrefixDto {
  // 2–5 letters/digits. Normalised to uppercase server-side.
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,5}$/, {
    message: 'Prefix must be 2–5 letters or digits (e.g. "MIS").',
  })
  prefix!: string;
}
