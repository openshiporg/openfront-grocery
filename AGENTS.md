# Agent rules

NEVER build outbox/texting/email notification machinery or cron/worker services. External events = Openfront Commerce webhooks (features/webhooks) only.

No timers, cron or workers: anything time-based (expiry, timeouts, overdue) is computed on read, on page load, or by a staff button.
