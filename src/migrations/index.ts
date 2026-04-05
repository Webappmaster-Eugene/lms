import * as migration_20260331_091624 from './20260331_091624';
import * as migration_20260402_095341 from './20260402_095341';
import * as migration_20260404_202710 from './20260404_202710';
import * as migration_20260405_102500_roadmap_nodes_miro_style from './20260405_102500_roadmap_nodes_miro_style';
import * as migration_20260405_150000_normalize_roadmap_description from './20260405_150000_normalize_roadmap_description';

export const migrations = [
  {
    up: migration_20260331_091624.up,
    down: migration_20260331_091624.down,
    name: '20260331_091624',
  },
  {
    up: migration_20260402_095341.up,
    down: migration_20260402_095341.down,
    name: '20260402_095341',
  },
  {
    up: migration_20260404_202710.up,
    down: migration_20260404_202710.down,
    name: '20260404_202710',
  },
  {
    up: migration_20260405_102500_roadmap_nodes_miro_style.up,
    down: migration_20260405_102500_roadmap_nodes_miro_style.down,
    name: '20260405_102500_roadmap_nodes_miro_style'
  },
  {
    up: migration_20260405_150000_normalize_roadmap_description.up,
    down: migration_20260405_150000_normalize_roadmap_description.down,
    name: '20260405_150000_normalize_roadmap_description',
  },
];
