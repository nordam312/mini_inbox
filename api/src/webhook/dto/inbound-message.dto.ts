import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * The payload a channel provider posts to us. Lengths are capped because the
 * outside world is not obliged to be reasonable.
 */
export class InboundMessageDto {
  /** The provider's id for this message. Used to make redelivery idempotent. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  externalId!: string;

  /** Who sent it - a phone number or handle. Identifies the customer. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  from!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;
}
