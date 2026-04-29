import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSystemCodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  groupCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  extraValue1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  extraValue2?: string;
}
