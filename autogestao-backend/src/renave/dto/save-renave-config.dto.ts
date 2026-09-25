import { IsBoolean, IsIn } from 'class-validator';

export const RENAVE_PARTNERS = ['Renave Fácil', 'InfoSimples', 'SERPRO Direto'] as const;
export type RenavePartner = (typeof RENAVE_PARTNERS)[number];

export class SaveRenaveConfigDto {
  @IsIn(RENAVE_PARTNERS)
  partner: RenavePartner;

  @IsBoolean()
  isExistingClient: boolean;
}