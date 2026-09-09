-- Cover every foreign-key column that the database advisor identified as
-- unindexed. These indexes keep joins and parent-row cascades bounded as the
-- admin, support, billing, and privacy queues grow.

create index if not exists admin_audit_events_admin_user_id_fk_idx
  on public.admin_audit_events(admin_user_id);
create index if not exists admin_members_granted_by_fk_idx
  on public.admin_members(granted_by);
create index if not exists ai_generations_resume_id_fk_idx
  on public.ai_generations(resume_id);
create index if not exists ai_generations_user_id_fk_idx
  on public.ai_generations(user_id);
create index if not exists app_error_events_resolved_by_fk_idx
  on public.app_error_events(resolved_by);
create index if not exists auto_apply_jobs_tailored_resume_id_fk_idx
  on public.auto_apply_jobs(tailored_resume_id);
create index if not exists customer_feedback_customer_user_id_fk_idx
  on public.customer_feedback(customer_user_id);
create index if not exists customer_feedback_guest_session_id_fk_idx
  on public.customer_feedback(guest_session_id);
create index if not exists job_applications_resume_id_fk_idx
  on public.job_applications(resume_id);
create index if not exists job_preferences_default_resume_id_fk_idx
  on public.job_preferences(default_resume_id);
create index if not exists manual_access_grants_granted_by_fk_idx
  on public.manual_access_grants(granted_by);
create index if not exists privacy_deletion_jobs_owner_approved_by_user_id_fk_idx
  on public.privacy_deletion_jobs(owner_approved_by_user_id);
create index if not exists privacy_deletion_jobs_requested_by_user_id_fk_idx
  on public.privacy_deletion_jobs(requested_by_user_id);
create index if not exists privacy_export_jobs_requested_by_user_id_fk_idx
  on public.privacy_export_jobs(requested_by_user_id);
create index if not exists privacy_holds_created_by_user_id_fk_idx
  on public.privacy_holds(created_by_user_id);
create index if not exists privacy_holds_released_by_user_id_fk_idx
  on public.privacy_holds(released_by_user_id);
create index if not exists privacy_provider_reviews_reviewed_by_user_id_fk_idx
  on public.privacy_provider_cancellation_reviews(reviewed_by_user_id);
create index if not exists support_ai_runs_trigger_message_id_fk_idx
  on public.support_ai_runs(trigger_message_id);
create index if not exists support_ai_settings_updated_by_user_id_fk_idx
  on public.support_ai_settings(updated_by_user_id);
create index if not exists support_ai_settings_history_changed_by_user_id_fk_idx
  on public.support_ai_settings_history(changed_by_user_id);
create index if not exists support_ai_usage_records_conversation_id_fk_idx
  on public.support_ai_usage_records(conversation_id);
create index if not exists support_attachments_guest_session_id_fk_idx
  on public.support_attachments(guest_session_id);
create index if not exists support_attachments_message_id_fk_idx
  on public.support_attachments(message_id);
create index if not exists support_attachments_uploader_user_id_fk_idx
  on public.support_attachments(uploader_user_id);
create index if not exists support_conversation_events_actor_user_id_fk_idx
  on public.support_conversation_events(actor_user_id);
create index if not exists support_conversations_assigned_agent_user_id_fk_idx
  on public.support_conversations(assigned_agent_user_id);
create index if not exists support_conversations_guest_session_id_fk_idx
  on public.support_conversations(guest_session_id);
create index if not exists support_delivery_outbox_conversation_id_fk_idx
  on public.support_delivery_outbox(conversation_id);
create index if not exists support_internal_notes_agent_user_id_fk_idx
  on public.support_internal_notes(agent_user_id);
create index if not exists support_knowledge_articles_created_by_user_id_fk_idx
  on public.support_knowledge_articles(created_by_user_id);
create index if not exists support_knowledge_articles_current_version_id_fk_idx
  on public.support_knowledge_articles(current_version_id);
create index if not exists support_knowledge_articles_updated_by_user_id_fk_idx
  on public.support_knowledge_articles(updated_by_user_id);
create index if not exists support_knowledge_versions_created_by_user_id_fk_idx
  on public.support_knowledge_versions(created_by_user_id);
create index if not exists support_knowledge_versions_reviewed_by_user_id_fk_idx
  on public.support_knowledge_versions(reviewed_by_user_id);
create index if not exists support_messages_reply_to_message_id_fk_idx
  on public.support_messages(reply_to_message_id);
create index if not exists support_messages_sender_user_id_fk_idx
  on public.support_messages(sender_user_id);
create index if not exists support_read_cursors_user_id_fk_idx
  on public.support_read_cursors(user_id);
create index if not exists support_routing_settings_updated_by_user_id_fk_idx
  on public.support_routing_settings(updated_by_user_id);
create index if not exists support_routing_settings_history_changed_by_user_id_fk_idx
  on public.support_routing_settings_history(changed_by_user_id);
