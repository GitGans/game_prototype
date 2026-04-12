import { Unit } from './types';

/**
 * Builds the turn order for a round.
 * - Sorted by initiative descending.
 * - Ties: interleave player first, then enemy (player, enemy, player, enemy, ...).
 */
export function buildRoundQueue(units: Map<string, Unit>): string[] {
  const alive = Array.from(units.values())
    .filter(u => u.hp > 0)
    .map(u => {
      const initBonus = u.activeEffects.reduce((sum, ae) => sum + (ae.effect.initiativeBonus ?? 0), 0);
      return initBonus !== 0 ? { ...u, initiative: u.initiative + initBonus } : u;
    });

  // Group by initiative value
  const groups = new Map<number, { player: Unit[]; enemy: Unit[] }>();
  for (const unit of alive) {
    if (!groups.has(unit.initiative)) {
      groups.set(unit.initiative, { player: [], enemy: [] });
    }
    groups.get(unit.initiative)![unit.anchor.side === 'player' ? 'player' : 'enemy'].push(unit);
  }

  // Sort initiative values descending
  const sortedInits = Array.from(groups.keys()).sort((a, b) => b - a);

  const queue: string[] = [];
  for (const init of sortedInits) {
    const { player, enemy } = groups.get(init)!;
    // Interleave: player, enemy, player, enemy, ...
    const maxLen = Math.max(player.length, enemy.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < player.length) queue.push(player[i].id);
      if (i < enemy.length) queue.push(enemy[i].id);
    }
  }

  return queue;
}

/**
 * Removes dead units from the queue.
 */
export function pruneQueue(queue: string[], units: Map<string, Unit>): string[] {
  return queue.filter(id => {
    const u = units.get(id);
    return u !== undefined && u.hp > 0;
  });
}
