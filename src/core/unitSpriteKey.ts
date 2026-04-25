import { SpriteSheetConfig } from '../battle/types';

export function getUnitSpriteTextureKey(templateId: string, spriteSheet: SpriteSheetConfig): string {
  const normalized = spriteSheet.path.replace(/[^a-zA-Z0-9]/g, '_');
  return `sprite-${templateId}-${normalized}`;
}
