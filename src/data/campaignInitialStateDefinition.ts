export interface CampaignInitialStateDefinition {
  initialMapId: string;
  initialMoney: number;
  initialCampUnitIds: readonly string[];
}

export const CAMPAIGN_INITIAL_STATE_DEFINITION: CampaignInitialStateDefinition = {
  initialMapId: 'test_01',
  initialMoney: 0,
  initialCampUnitIds: ['healer', 'shaman', 'destroyer'],
};
