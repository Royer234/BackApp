import type { BackupFile } from './backup-file';

export type BackupRunStatus = 'pending' | 'running' | 'completed' | 'success' | 'failed';

export interface BackupRun {
  id: number;
  backup_profile_id: number;
  start_time?: string;
  end_time?: string;
  status: BackupRunStatus;
  local_backup_path?: string;
  total_files?: number;
  total_size_bytes?: number;
  error_message?: string;
  log?: string;
  retention_cleaned_up?: boolean;
  backup_files?: BackupFile[];
}
