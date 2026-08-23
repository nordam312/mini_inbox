import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Providers pad values with whitespace; the same sender must not become two customers. */
const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/**
 * The payload a channel provider posts to us. Lengths are capped because the
 * outside world is not obliged to be reasonable.
 */
export class InboundMessageDto {
  /** The provider's id for this message. Used to make redelivery idempotent. */
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  externalId!: string;

  /** Who sent it - a phone number or handle. Identifies the customer. */
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  from!: string;

  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;
}
