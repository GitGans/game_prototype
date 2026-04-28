export interface PrepUnitPanelItem {
  templateId: string;
  name:       string;
  level:      number;
  inCamp:     boolean;
}

export interface CampPanelData {
  units: PrepUnitPanelItem[];
}

export interface PartyPanelData {
  units: PrepUnitPanelItem[];
}
