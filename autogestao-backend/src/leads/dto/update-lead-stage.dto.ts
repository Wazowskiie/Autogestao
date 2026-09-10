import { IsEnum } from 'class-validator';

export enum LeadStage {
  new = 'new', contacted = 'contacted', negotiating = 'negotiating',
  won = 'won', lost = 'lost',
}

export class UpdateLeadStageDto {
  @IsEnum(LeadStage)
  stage: LeadStage;
}
