import { describe, it, expect, beforeEach } from 'vitest';
import { buildSkillPreviewModel, type SkillPreviewInput, type SkillPreviewUnit } from '../../src/battle/skillPreview';
import { resolveReviveTargetsForAction, computeReviveHp } from '../../src/battle/revive';
import { SKILLS } from '../../src/data/skills/skillDefinitions';
import { SHAPES } from '../../src/data/shapeDefinitions';
import type { CellCoord } from '../../src/shared/gridTypes';
import type { UnitDeployment } from '../../src/shared/unitDeploymentTypes';
import { coord } from './helpers/coords';

function makePreviewUnit(overrides: Partial<SkillPreviewUnit>): SkillPreviewUnit {
  return {
    id: 'u',
    name: 'U',
    side: 'player',
    lifeState: 'alive',
    hp: 100,
    maxHp: 100,
    shape: SHAPES['1x1'],
    effectiveStats: {
      physicalStrength: 0,
      magicalStrength: 0,
      physicalDefense: 0,
      magicalDefense: 0,
      dodge: 0,
      block: 0,
      initiative: 0,
    },
    skills: [SKILLS.revive],
    activeSkillIndex: 0,
    ...overrides,
  };
}

beforeEach(() => {});

describe('skillPreview — revive branch', () => {
  it('preview highlight cells equal resolver targets[].cells (1x1 corpse)', () => {
    const caster = makePreviewUnit({ id: 'c', side: 'player' });
    const corpse = makePreviewUnit({
      id: 'd', side: 'player', lifeState: 'dead', hp: 0, shape: SHAPES['1x1'],
    });
    const targetAnchor: CellCoord = coord('player', 1, 1);
    const unitsById = new Map<string, SkillPreviewUnit>([
      [caster.id, caster],
      [corpse.id, corpse],
    ]);
    const deployments = new Map<string, UnitDeployment>([
      [caster.id, { kind: 'field', anchor: coord('player', 0, 0) }],
      [corpse.id, { kind: 'field', anchor: targetAnchor }],
    ]);
    const input: SkillPreviewInput = {
      activeUnit: caster,
      targetCoord: targetAnchor,
      occupancy: { cellToUnitId: new Map() },
      unitsById,
      deployments,
    };
    const model = buildSkillPreviewModel(input)!;
    expect(model).not.toBeNull();

    const resolverResult = resolveReviveTargetsForAction({
      units: unitsById,
      deployments,
      casterSide: 'player',
      targetAnchor,
      matrix: { kind: 'effect_area_matrix', matrixName: 'single' },
    });
    const resolverCells = resolverResult.targets.flatMap((t) => t.cells);

    expect(model.cells.map((c) => c.coord)).toEqual(resolverCells);
    for (const c of model.cells) {
      expect(c.kind).toBe('effect');
      expect(c.highlight).toBe('revive');
    }
  });

  it('multi-cell corpse: preview includes every body cell and one status line', () => {
    const caster = makePreviewUnit({ id: 'c', side: 'player' });
    // 2-cell horizontal shape: (0,0) + (0,1)
    const twoCellShape = { offsets: [{ dr: 0, dc: 0 }, { dr: 0, dc: 1 }] };
    const corpse = makePreviewUnit({
      id: 'd', side: 'player', lifeState: 'dead', hp: 0,
      shape: twoCellShape,
    });
    const corpseAnchor = coord('player', 1, 0);
    const targetAnchor = corpseAnchor; // anchor on first body cell
    const unitsById = new Map<string, SkillPreviewUnit>([
      [caster.id, caster],
      [corpse.id, corpse],
    ]);
    const deployments = new Map<string, UnitDeployment>([
      [caster.id, { kind: 'field', anchor: coord('player', 0, 0) }],
      [corpse.id, { kind: 'field', anchor: corpseAnchor }],
    ]);
    const model = buildSkillPreviewModel({
      activeUnit: caster,
      targetCoord: targetAnchor,
      occupancy: { cellToUnitId: new Map() },
      unitsById,
      deployments,
    })!;

    // 2 cells in preview though matrix only resolves 1 affected cell.
    expect(model.cells).toHaveLength(2);
    expect(model.statusLines).toHaveLength(1);
    expect(model.statusLines[0]).toContain('revived');
  });

  it('status amount equals computeReviveHp', () => {
    const caster = makePreviewUnit({ id: 'c' });
    const corpse = makePreviewUnit({
      id: 'd', side: 'player', lifeState: 'dead', hp: 0, maxHp: 80,
    });
    const targetAnchor = coord('player', 1, 0);
    const unitsById = new Map<string, SkillPreviewUnit>([
      [caster.id, caster],
      [corpse.id, corpse],
    ]);
    const deployments = new Map<string, UnitDeployment>([
      [caster.id, { kind: 'field', anchor: coord('player', 0, 0) }],
      [corpse.id, { kind: 'field', anchor: targetAnchor }],
    ]);
    const model = buildSkillPreviewModel({
      activeUnit: caster,
      targetCoord: targetAnchor,
      occupancy: { cellToUnitId: new Map() },
      unitsById,
      deployments,
    })!;
    const expectedHp = computeReviveHp({ maxHp: 80 }, { level: 1 });
    expect(model.statusLines[0]).toContain(`+${expectedHp}`);
  });
});
