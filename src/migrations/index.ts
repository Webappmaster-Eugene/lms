import * as migration_20260331_091624 from './20260331_091624';
import * as migration_20260402_095341 from './20260402_095341';
import * as migration_20260404_202710 from './20260404_202710';
import * as migration_20260405_102500_roadmap_nodes_miro_style from './20260405_102500_roadmap_nodes_miro_style';
import * as migration_20260405_150000_normalize_roadmap_description from './20260405_150000_normalize_roadmap_description';
import * as migration_20260911_233042_payload_389_sessions_kv from './20260911_233042_payload_389_sessions_kv';
import * as migration_20260914_140000_course_roadmap_node from './20260914_140000_course_roadmap_node';
import * as migration_20260914_161713_trainer_leetcode from './20260914_161713_trainer_leetcode';
import * as migration_20260914_170505_trainer_setup_types from './20260914_170505_trainer_setup_types';
import * as migration_20260928_220510_bookmarks from './20260928_220510_bookmarks';
import * as migration_20261005_213201_interview_rooms_and_contacts from './20261005_213201_interview_rooms_and_contacts';
import * as migration_20261008_095919_lesson_learning_states from './20261008_095919_lesson_learning_states';
import * as migration_20261008_133507_learning_access_and_protected_assets from './20261008_133507_learning_access_and_protected_assets';
import * as migration_20261008_134222_default_assigned_learning_access from './20261008_134222_default_assigned_learning_access';
import * as migration_20261008_143020_authoritative_learning_access_policies from './20261008_143020_authoritative_learning_access_policies';
import * as migration_20261008_152004_auth_session_revocations from './20261008_152004_auth_session_revocations';
import * as migration_20261008_193430_pwa_notifications_and_learning_rewards from './20261008_193430_pwa_notifications_and_learning_rewards';
import * as migration_20261008_205700_student_analytics_and_web_vitals from './20261008_205700_student_analytics_and_web_vitals';
import * as migration_20261009_122629_catalog_visibility_and_trainer_access from './20261009_122629_catalog_visibility_and_trainer_access';
import * as migration_20261010_064516_trainer_go_frontend from './20261010_064516_trainer_go_frontend';
import * as migration_20261010_132320_account_comments_settings from './20261010_132320_account_comments_settings';
import * as migration_20261010_151210_learning_history_index from './20261010_151210_learning_history_index';
import * as migration_20261010_184804_trainer_python_interview_metadata from './20261010_184804_trainer_python_interview_metadata';

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
    name: '20260405_102500_roadmap_nodes_miro_style',
  },
  {
    up: migration_20260405_150000_normalize_roadmap_description.up,
    down: migration_20260405_150000_normalize_roadmap_description.down,
    name: '20260405_150000_normalize_roadmap_description',
  },
  {
    up: migration_20260911_233042_payload_389_sessions_kv.up,
    down: migration_20260911_233042_payload_389_sessions_kv.down,
    name: '20260911_233042_payload_389_sessions_kv',
  },
  {
    up: migration_20260914_140000_course_roadmap_node.up,
    down: migration_20260914_140000_course_roadmap_node.down,
    name: '20260914_140000_course_roadmap_node',
  },
  {
    up: migration_20260914_161713_trainer_leetcode.up,
    down: migration_20260914_161713_trainer_leetcode.down,
    name: '20260914_161713_trainer_leetcode',
  },
  {
    up: migration_20260914_170505_trainer_setup_types.up,
    down: migration_20260914_170505_trainer_setup_types.down,
    name: '20260914_170505_trainer_setup_types',
  },
  {
    up: migration_20260928_220510_bookmarks.up,
    down: migration_20260928_220510_bookmarks.down,
    name: '20260928_220510_bookmarks',
  },
  {
    up: migration_20261005_213201_interview_rooms_and_contacts.up,
    down: migration_20261005_213201_interview_rooms_and_contacts.down,
    name: '20261005_213201_interview_rooms_and_contacts',
  },
  {
    up: migration_20261008_095919_lesson_learning_states.up,
    down: migration_20261008_095919_lesson_learning_states.down,
    name: '20261008_095919_lesson_learning_states',
  },
  {
    up: migration_20261008_133507_learning_access_and_protected_assets.up,
    down: migration_20261008_133507_learning_access_and_protected_assets.down,
    name: '20261008_133507_learning_access_and_protected_assets',
  },
  {
    up: migration_20261008_134222_default_assigned_learning_access.up,
    down: migration_20261008_134222_default_assigned_learning_access.down,
    name: '20261008_134222_default_assigned_learning_access',
  },
  {
    up: migration_20261008_143020_authoritative_learning_access_policies.up,
    down: migration_20261008_143020_authoritative_learning_access_policies.down,
    name: '20261008_143020_authoritative_learning_access_policies',
  },
  {
    up: migration_20261008_152004_auth_session_revocations.up,
    down: migration_20261008_152004_auth_session_revocations.down,
    name: '20261008_152004_auth_session_revocations',
  },
  {
    up: migration_20261008_193430_pwa_notifications_and_learning_rewards.up,
    down: migration_20261008_193430_pwa_notifications_and_learning_rewards.down,
    name: '20261008_193430_pwa_notifications_and_learning_rewards',
  },
  {
    up: migration_20261008_205700_student_analytics_and_web_vitals.up,
    down: migration_20261008_205700_student_analytics_and_web_vitals.down,
    name: '20261008_205700_student_analytics_and_web_vitals',
  },
  {
    up: migration_20261009_122629_catalog_visibility_and_trainer_access.up,
    down: migration_20261009_122629_catalog_visibility_and_trainer_access.down,
    name: '20261009_122629_catalog_visibility_and_trainer_access',
  },
  {
    up: migration_20261010_064516_trainer_go_frontend.up,
    down: migration_20261010_064516_trainer_go_frontend.down,
    name: '20261010_064516_trainer_go_frontend',
  },
  {
    up: migration_20261010_132320_account_comments_settings.up,
    down: migration_20261010_132320_account_comments_settings.down,
    name: '20261010_132320_account_comments_settings',
  },
  {
    up: migration_20261010_151210_learning_history_index.up,
    down: migration_20261010_151210_learning_history_index.down,
    name: '20261010_151210_learning_history_index',
  },
  {
    up: migration_20261010_184804_trainer_python_interview_metadata.up,
    down: migration_20261010_184804_trainer_python_interview_metadata.down,
    name: '20261010_184804_trainer_python_interview_metadata'
  },
];
