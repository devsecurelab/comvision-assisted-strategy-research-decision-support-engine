import { uploadIdFor, uploadWithBackoff } from './operationalStorage';

export interface SummaryUploadOptions { repositoryVisibility?: 'public' | 'private'; upload: (payload: unknown, id: string) => Promise<void>; maxAttempts?: number; }

export async function uploadSummary(payload: unknown, options: SummaryUploadOptions): Promise<{ uploaded: boolean; id: string; attempts: number; error?: string }> {
  const id = uploadIdFor(payload);
  if (options.repositoryVisibility === 'public') return { uploaded: false, id, attempts: 0, error: 'PUBLIC_REPOSITORY_UPLOAD_REJECTED' };
  const result = await uploadWithBackoff(() => options.upload(payload, id), { maxAttempts: options.maxAttempts ?? 3 });
  return result.error ? { uploaded: false, id, attempts: result.attempts, error: result.error.message } : { uploaded: true, id, attempts: result.attempts };
}
