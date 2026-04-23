/** Совпадает с `FEEDBACK_INBOX_HANDLE` на сервере — этот handle видит все баги и предложения. */
export const FEEDBACK_INBOX_HANDLE = 'admin';

export function isFeedbackInboxViewer(handle: string | null | undefined): boolean {
  return (handle ?? '').trim().toLowerCase() === FEEDBACK_INBOX_HANDLE;
}
