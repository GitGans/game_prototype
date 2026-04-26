import type { UnitStatsSnapshot, SkillIconSnapshot } from './snapshotTypes';

// Display snapshot for one unit on the placement bench.
// Rebuilt on upgrade/equip/debug-setup changes. Stale-snapshot prevention
// is not enforced at runtime — known limitation, addressed in Step 2.
export interface BenchUnitSnapshot {
  templateId: string;
  name:       string;
  level:      number;
  spriteKey:  string | null;
  stats:      UnitStatsSnapshot;
  skills:     SkillIconSnapshot[];
}
