const HH_MM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** A fulfillment window is two 24-hour HH:MM times, ending after it starts. */
export function slotWindowError(startTime: unknown, endTime: unknown): string | null {
  if (typeof startTime !== 'string' || !HH_MM.test(startTime)) return 'Start time must be a 24-hour time such as 09:00.';
  if (typeof endTime !== 'string' || !HH_MM.test(endTime)) return 'End time must be a 24-hour time such as 11:00.';
  if (endTime <= startTime) return `The window must end after it starts (${startTime}–${endTime}).`;
  return null;
}
