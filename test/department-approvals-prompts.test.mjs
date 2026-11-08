import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;

// Hiveku's department agents stage each of these as an approval card on the web (Project Management,
// Sales, Support, Accounting and Marketing). A Codex chat calls them directly, so each one prompts.
const DEPARTMENT_APPROVALS = [
  'pm_project_tasks_copy',
  'pm_tasks_create_bulk',
  'pm_tasks_reassign_bulk',
  'pm_sections_delete',
  'pm_milestones_delete',
  'pm_milestones_close',
  'pm_task_time_log_create',
  'crm_contact_merge',
  'crm_delete_contact',
  'crm_delete_company',
  'crm_delete_deal',
  'crm_delete_sequence',
  'crm_delete_custom_field',
  'crm_delete_tag',
  'crm_delete_email_template',
  'crm_contacts_bulk_create',
  'crm_companies_bulk_create',
  'crm_deals_bulk_create',
  'crm_activities_bulk_create',
  'crm_unenroll_sequence',
  'crm_pause_sequence_enrollment',
  'crm_resume_sequence_enrollment',
  'crm_email_batch_cancel',
  'crm_email_batch_reschedule',
  'calendar_create_event',
  'helpdesk_ticket_merge',
  'helpdesk_ticket_set_status',
  'helpdesk_ticket_create',
  'helpdesk_ticket_transfer_to_voice',
  'accounting_bill_schedule_create',
  'accounting_vendor_delete',
  'brand_guide_update',
];

test('the actions the department agents stage for approval require a prompt', () => {
  for (const name of DEPARTMENT_APPROVALS) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
});
