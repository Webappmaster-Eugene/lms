import * as migration_20260331_091624 from './20260331_091624';

export const migrations = [
  {
    up: migration_20260331_091624.up,
    down: migration_20260331_091624.down,
    name: '20260331_091624'
  },
];
