import { IsUrl } from 'class-validator';

export class PublishAdDto {
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'], require_tld: true })
  externalUrl!: string;
}
