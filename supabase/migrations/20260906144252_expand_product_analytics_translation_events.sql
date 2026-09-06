begin;

set local lock_timeout = '2s';
set local statement_timeout = '15s';

alter table public.product_analytics_events
  drop constraint product_analytics_events_event_name_check,
  add constraint product_analytics_events_event_name_check check (
    event_name in (
      'page_view',
      'input_start',
      'translation_submit',
      'translation_success',
      'translation_failure',
      'translation_refine_submit',
      'translation_refine_success',
      'translation_refine_failure',
      'translation_drill_save',
      'drill_open',
      'drill_answer',
      'conversation_drill_save'
    )
  );

commit;
