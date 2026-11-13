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
import * as migration_20261010_211458_interview_library from './20261010_211458_interview_library';
import * as migration_20261010_212032_interview_analysis_usage from './20261010_212032_interview_analysis_usage';
import * as migration_20261011_074547_checkfrod_interview_integration from './20261011_074547_checkfrod_interview_integration';
import * as migration_20261012_170329_slides_block from './20261012_170329_slides_block';
import * as migration_20261020_195554_email_broadcasts from './20261020_195554_email_broadcasts';
import * as migration_20261022_093223_guides from './20261022_093223_guides';
import * as migration_20261022_131120_guides_access from './20261022_131120_guides_access';
import * as migration_20261022_191842_guides_markdown from './20261022_191842_guides_markdown';
import * as migration_20261022_204749_bootcamp_manuals from './20261022_204749_bootcamp_manuals';
import * as migration_20261023_105821_guides_v2 from './20261023_105821_guides_v2';
import * as migration_20261023_154432_guides_drop_content from './20261023_154432_guides_drop_content';
import * as migration_20261023_164448_guides_categories from './20261023_164448_guides_categories';
import * as migration_20261024_003709_guides_drop_category_enum from './20261024_003709_guides_drop_category_enum';
import * as migration_20261025_162718_guides_public from './20261025_162718_guides_public';
import * as migration_20261026_122133_bootcamp_leads from './20261026_122133_bootcamp_leads';
import * as migration_20261026_171327_bootcamp_courses from './20261026_171327_bootcamp_courses';
import * as migration_20261027_120355_bootcamp_entry_task from './20261027_120355_bootcamp_entry_task';
import * as migration_20261027_202028_roadmap_node_extras from './20261027_202028_roadmap_node_extras';
import * as migration_20261028_130757_bootcamp_entry_submission from './20261028_130757_bootcamp_entry_submission';
import * as migration_20261030_201902_bootcamp_enrollments from './20261030_201902_bootcamp_enrollments';
import * as migration_20261031_090000_bootcamp_group_rename from './20261031_090000_bootcamp_group_rename';
import * as migration_20261031_090450_bootcamp_lead_path from './20261031_090450_bootcamp_lead_path';
import * as migration_20261031_132906_bootcamp_weekly_summary from './20261031_132906_bootcamp_weekly_summary';
import * as migration_20261031_225020_bootcamp_programs from './20261031_225020_bootcamp_programs';
import * as migration_20261101_091948_lesson_notes_block from './20261101_091948_lesson_notes_block';
import * as migration_20261101_140250_bootcamp_test_leads from './20261101_140250_bootcamp_test_leads';
import * as migration_20261101_142056_trainer_sql from './20261101_142056_trainer_sql';
import * as migration_20261102_115826_yandex_import_course_optional from './20261102_115826_yandex_import_course_optional';
import * as migration_20261105_133159_bootcamp_lead_application from './20261105_133159_bootcamp_lead_application';
import * as migration_20261109_065651_reply_templates from './20261109_065651_reply_templates';
import * as migration_20261109_120000_bootcamp_offer_12_weeks from './20261109_120000_bootcamp_offer_12_weeks';
import * as migration_20261110_085441_bootcamp_lead_metrika_client_id from './20261110_085441_bootcamp_lead_metrika_client_id';
import * as migration_20261111_071030_bootcamp_refunds from './20261111_071030_bootcamp_refunds';
import * as migration_20261111_131554_payload_391 from './20261111_131554_payload_391';
import * as migration_20261112_161557_account_freezes from './20261112_161557_account_freezes';
import * as migration_20261113_054229_analytics_activity_days from './20261113_054229_analytics_activity_days';
import * as migration_20261113_061701_bootcamp_week_progress from './20261113_061701_bootcamp_week_progress';

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
    name: '20261010_184804_trainer_python_interview_metadata',
  },
  {
    up: migration_20261010_211458_interview_library.up,
    down: migration_20261010_211458_interview_library.down,
    name: '20261010_211458_interview_library',
  },
  {
    up: migration_20261010_212032_interview_analysis_usage.up,
    down: migration_20261010_212032_interview_analysis_usage.down,
    name: '20261010_212032_interview_analysis_usage',
  },
  {
    up: migration_20261011_074547_checkfrod_interview_integration.up,
    down: migration_20261011_074547_checkfrod_interview_integration.down,
    name: '20261011_074547_checkfrod_interview_integration',
  },
  {
    up: migration_20261012_170329_slides_block.up,
    down: migration_20261012_170329_slides_block.down,
    name: '20261012_170329_slides_block',
  },
  {
    up: migration_20261020_195554_email_broadcasts.up,
    down: migration_20261020_195554_email_broadcasts.down,
    name: '20261020_195554_email_broadcasts',
  },
  {
    up: migration_20261022_093223_guides.up,
    down: migration_20261022_093223_guides.down,
    name: '20261022_093223_guides',
  },
  {
    up: migration_20261022_131120_guides_access.up,
    down: migration_20261022_131120_guides_access.down,
    name: '20261022_131120_guides_access',
  },
  {
    up: migration_20261022_191842_guides_markdown.up,
    down: migration_20261022_191842_guides_markdown.down,
    name: '20261022_191842_guides_markdown',
  },
  {
    up: migration_20261022_204749_bootcamp_manuals.up,
    down: migration_20261022_204749_bootcamp_manuals.down,
    name: '20261022_204749_bootcamp_manuals',
  },
  {
    up: migration_20261023_105821_guides_v2.up,
    down: migration_20261023_105821_guides_v2.down,
    name: '20261023_105821_guides_v2',
  },
  {
    up: migration_20261023_154432_guides_drop_content.up,
    down: migration_20261023_154432_guides_drop_content.down,
    name: '20261023_154432_guides_drop_content',
  },
  {
    up: migration_20261023_164448_guides_categories.up,
    down: migration_20261023_164448_guides_categories.down,
    name: '20261023_164448_guides_categories',
  },
  {
    up: migration_20261024_003709_guides_drop_category_enum.up,
    down: migration_20261024_003709_guides_drop_category_enum.down,
    name: '20261024_003709_guides_drop_category_enum',
  },
  {
    up: migration_20261025_162718_guides_public.up,
    down: migration_20261025_162718_guides_public.down,
    name: '20261025_162718_guides_public',
  },
  {
    up: migration_20261026_122133_bootcamp_leads.up,
    down: migration_20261026_122133_bootcamp_leads.down,
    name: '20261026_122133_bootcamp_leads',
  },
  {
    up: migration_20261026_171327_bootcamp_courses.up,
    down: migration_20261026_171327_bootcamp_courses.down,
    name: '20261026_171327_bootcamp_courses',
  },
  {
    up: migration_20261027_120355_bootcamp_entry_task.up,
    down: migration_20261027_120355_bootcamp_entry_task.down,
    name: '20261027_120355_bootcamp_entry_task',
  },
  {
    up: migration_20261027_202028_roadmap_node_extras.up,
    down: migration_20261027_202028_roadmap_node_extras.down,
    name: '20261027_202028_roadmap_node_extras',
  },
  {
    up: migration_20261028_130757_bootcamp_entry_submission.up,
    down: migration_20261028_130757_bootcamp_entry_submission.down,
    name: '20261028_130757_bootcamp_entry_submission',
  },
  {
    up: migration_20261030_201902_bootcamp_enrollments.up,
    down: migration_20261030_201902_bootcamp_enrollments.down,
    name: '20261030_201902_bootcamp_enrollments',
  },
  {
    up: migration_20261031_090000_bootcamp_group_rename.up,
    down: migration_20261031_090000_bootcamp_group_rename.down,
    name: '20261031_090000_bootcamp_group_rename',
  },
  {
    up: migration_20261031_090450_bootcamp_lead_path.up,
    down: migration_20261031_090450_bootcamp_lead_path.down,
    name: '20261031_090450_bootcamp_lead_path',
  },
  {
    up: migration_20261031_132906_bootcamp_weekly_summary.up,
    down: migration_20261031_132906_bootcamp_weekly_summary.down,
    name: '20261031_132906_bootcamp_weekly_summary',
  },
  {
    up: migration_20261031_225020_bootcamp_programs.up,
    down: migration_20261031_225020_bootcamp_programs.down,
    name: '20261031_225020_bootcamp_programs',
  },
  {
    up: migration_20261101_091948_lesson_notes_block.up,
    down: migration_20261101_091948_lesson_notes_block.down,
    name: '20261101_091948_lesson_notes_block',
  },
  {
    up: migration_20261101_140250_bootcamp_test_leads.up,
    down: migration_20261101_140250_bootcamp_test_leads.down,
    name: '20261101_140250_bootcamp_test_leads',
  },
  {
    up: migration_20261101_142056_trainer_sql.up,
    down: migration_20261101_142056_trainer_sql.down,
    name: '20261101_142056_trainer_sql',
  },
  {
    up: migration_20261102_115826_yandex_import_course_optional.up,
    down: migration_20261102_115826_yandex_import_course_optional.down,
    name: '20261102_115826_yandex_import_course_optional',
  },
  {
    up: migration_20261105_133159_bootcamp_lead_application.up,
    down: migration_20261105_133159_bootcamp_lead_application.down,
    name: '20261105_133159_bootcamp_lead_application',
  },
  {
    up: migration_20261109_065651_reply_templates.up,
    down: migration_20261109_065651_reply_templates.down,
    name: '20261109_065651_reply_templates',
  },
  {
    up: migration_20261109_120000_bootcamp_offer_12_weeks.up,
    down: migration_20261109_120000_bootcamp_offer_12_weeks.down,
    name: '20261109_120000_bootcamp_offer_12_weeks',
  },
  {
    up: migration_20261110_085441_bootcamp_lead_metrika_client_id.up,
    down: migration_20261110_085441_bootcamp_lead_metrika_client_id.down,
    name: '20261110_085441_bootcamp_lead_metrika_client_id',
  },
  {
    up: migration_20261111_071030_bootcamp_refunds.up,
    down: migration_20261111_071030_bootcamp_refunds.down,
    name: '20261111_071030_bootcamp_refunds',
  },
  {
    up: migration_20261111_131554_payload_391.up,
    down: migration_20261111_131554_payload_391.down,
    name: '20261111_131554_payload_391',
  },
  {
    up: migration_20261112_161557_account_freezes.up,
    down: migration_20261112_161557_account_freezes.down,
    name: '20261112_161557_account_freezes',
  },
  {
    up: migration_20261113_054229_analytics_activity_days.up,
    down: migration_20261113_054229_analytics_activity_days.down,
    name: '20261113_054229_analytics_activity_days',
  },
  {
    up: migration_20261113_061701_bootcamp_week_progress.up,
    down: migration_20261113_061701_bootcamp_week_progress.down,
    name: '20261113_061701_bootcamp_week_progress'
  },
];
