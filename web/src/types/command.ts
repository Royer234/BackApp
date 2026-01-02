export interface Command {
  id: number;
  backup_profile_id: number;
  command: string;
  working_directory: string;
  run_order: number;
  run_stage: 'pre' | 'post';
  created_at: string;
}

export interface CommandCreateInput {
  command: string;
  working_directory?: string;
  run_order: number;
  run_stage: 'pre' | 'post';
}

export interface CommandUpdateInput {
  command?: string;
  working_directory?: string;
  run_order?: number;
  run_stage?: 'pre' | 'post';
}
