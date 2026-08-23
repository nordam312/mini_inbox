import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class OperatorReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;
}
