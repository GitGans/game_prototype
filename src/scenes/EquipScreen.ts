import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';
import { EventBus, Events } from '../core/EventBus';
import {
  BackpackSnapshot,
  EquipmentSnapshot,
  UnitTabSnapshot,
} from '../battle/types';

type EquipScreenPhase = Extract<ReturnType<typeof PhaseManager.getPhase>, { type: 'equip_screen' }>;

export class EquipScreen extends Phaser.Scene {
  selectedTemplateId!: string; // read by TODO render methods

  constructor() { super({ key: 'EquipScreen' }); }

  create(): void {
    const phase = PhaseManager.getPhase() as EquipScreenPhase;
    this.selectedTemplateId = phase.selectedUnitTemplateId;
    this.renderFromPhase(phase);
    EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  shutdown(): void {
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  private renderFromPhase(phase: EquipScreenPhase): void {
    this.renderUnitTabs(phase.availableUnits);
    this.renderBackpack(phase.backpack);
    this.renderEquipment(phase.unitEquipment);
    this.renderBackButton();
  }

  private onStateChanged(): void {
    const phase = PhaseManager.getPhase() as EquipScreenPhase;
    this.renderBackpack(phase.backpack);
    this.renderEquipment(phase.unitEquipment);
  }

  private renderUnitTabs(_units: UnitTabSnapshot[]): void {
    // TODO: render tabs; on click: PhaseManager.transition({ type: 'switch_equip_unit', templateId })
  }

  private renderBackpack(_snapshot: BackpackSnapshot): void {
    // TODO: render 24 slots; on item click: PhaseManager.transition({ type: 'equip_item', unitTemplateId: this.selectedTemplateId, instanceId })
  }

  private renderEquipment(_snapshot: EquipmentSnapshot): void {
    // TODO: render equipment silhouette; on slot click: PhaseManager.transition({ type: 'unequip_item', unitTemplateId: this.selectedTemplateId, slot })
  }

  private renderBackButton(): void {
    // TODO: render back button; on click: PhaseManager.transition({ type: 'close_equip_screen' })
  }
}
