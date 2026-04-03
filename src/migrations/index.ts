import * as migration_20260331_091624 from './20260331_091624';
import * as migration_20260402_095341 from './20260402_095341';

export const migrations = [
  {
    up: migration_20260331_091624.up,
    down: migration_20260331_091624.down,
    name: '20260331_091624',
  },
  {
    up: migration_20260402_095341.up,
    down: migration_20260402_095341.down,
    name: '20260402_095341'
  },
];
