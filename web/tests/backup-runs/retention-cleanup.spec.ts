import { expect, test } from '@playwright/test';
import * as path from 'path';
import type { Server } from 'ssh2';
import {
  createBackupProfileViaApi,
  createNamingRuleViaApi,
  createServerViaApi,
  createStorageLocationViaApi,
  getBackupRunFilesViaApi,
  getBackupRunViaApi,
  resetDatabase,
  runBackupViaApi,
  triggerRetentionCleanup,
  updateBackupProfileViaApi,
  updateBackupRunDate,
  waitForBackupRunComplete,
} from '../helpers/api-helpers';
import {
  cleanupTestDirectory,
  fileExistsOnDisk,
  getAllFilesInDirectory,
  TEST_BASE_PATH,
} from '../helpers/fs-helpers';
import {
  createVirtualDirectory,
  createVirtualFile,
  startFakeSSHServerWithFiles,
  type VirtualFile,
} from '../helpers/fake-ssh-server';

test.describe('Retention Cleanup', () => {
  let sshServer: Server;
  const SSH_PORT = 2225;

  test.beforeAll(async () => {
    // Create virtual filesystem with test files
    const virtualFiles = new Map<string, VirtualFile>();
    virtualFiles.set('/', createVirtualDirectory());
    virtualFiles.set('/backup', createVirtualDirectory());
    virtualFiles.set('/backup/db_backup.sql', createVirtualFile('-- SQL dump content\nCREATE TABLE test;'));
    virtualFiles.set('/backup/config.json', createVirtualFile('{"setting": "value"}'));
    virtualFiles.set('/backup/data.csv', createVirtualFile('id,name\n1,test'));

    sshServer = await startFakeSSHServerWithFiles({
      port: SSH_PORT,
      username: 'root',
      password: 'testpass',
      virtualFiles,
    });
  });

  test.afterAll(async () => {
    if (sshServer) {
      sshServer.close();
    }
  });

  test.beforeEach(async ({ request }) => {
    await cleanupTestDirectory();
    await resetDatabase(request);
  });

  test.describe('Basic Retention Cleanup', () => {
    test('should delete files older than retention period', async ({ request }) => {
      // Setup
      const serverId = await createServerViaApi(request, 'Test Server', 'localhost', SSH_PORT, 'root', 'testpass');
      const storagePath = path.join(TEST_BASE_PATH, 'backups');
      const storageLocationId = await createStorageLocationViaApi(request, 'Test Storage', storagePath);
      const namingRuleId = await createNamingRuleViaApi(request, 'Simple', '{profile}');
      const profileId = await createBackupProfileViaApi(request, 'TestBackup', serverId, storageLocationId, namingRuleId, [
        { remote_path: '/backup/db_backup.sql' },
      ]);

      // Set retention policy to 7 days
      await updateBackupProfileViaApi(request, profileId, { retention_days: 7 });

      // Run backup
      const runId = await runBackupViaApi(request, profileId);
      await waitForBackupRunComplete(request, runId);

      // Verify files exist before cleanup
      const filesBeforeCleanup = getAllFilesInDirectory(storagePath);
      expect(filesBeforeCleanup.length).toBe(1);
      expect(fileExistsOnDisk(filesBeforeCleanup[0])).toBe(true);

      // Set backup run date to 10 days ago (older than retention period)
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      await updateBackupRunDate(request, runId, tenDaysAgo);

      // Trigger retention cleanup
      await triggerRetentionCleanup(request);

      // Verify files are deleted
      expect(fileExistsOnDisk(filesBeforeCleanup[0])).toBe(false);

      // Verify backup run is marked as cleaned up
      const run = await getBackupRunViaApi(request, runId);
      expect(run.retention_cleaned_up).toBe(true);
    });

    test('should not delete files newer than retention period', async ({ request }) => {
      // Setup
      const serverId = await createServerViaApi(request, 'Test Server', 'localhost', SSH_PORT, 'root', 'testpass');
      const storagePath = path.join(TEST_BASE_PATH, 'backups');
      const storageLocationId = await createStorageLocationViaApi(request, 'Test Storage', storagePath);
      const namingRuleId = await createNamingRuleViaApi(request, 'Simple', '{profile}');
      const profileId = await createBackupProfileViaApi(request, 'TestBackup', serverId, storageLocationId, namingRuleId, [
        { remote_path: '/backup/db_backup.sql' },
      ]);

      // Set retention policy to 7 days
      await updateBackupProfileViaApi(request, profileId, { retention_days: 7 });

      // Run backup
      const runId = await runBackupViaApi(request, profileId);
      await waitForBackupRunComplete(request, runId);

      // Verify files exist before cleanup
      const filesBeforeCleanup = getAllFilesInDirectory(storagePath);
      expect(filesBeforeCleanup.length).toBe(1);
      const filePath = filesBeforeCleanup[0];

      // Set backup run date to 3 days ago (newer than retention period)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      await updateBackupRunDate(request, runId, threeDaysAgo);

      // Trigger retention cleanup
      await triggerRetentionCleanup(request);

      // Verify files still exist
      expect(fileExistsOnDisk(filePath)).toBe(true);

      // Verify backup run is NOT marked as cleaned up
      const run = await getBackupRunViaApi(request, runId);
      expect(run.retention_cleaned_up).toBe(false);
    });

    test('should not delete files when retention policy is not set', async ({ request }) => {
      // Setup without retention policy
      const serverId = await createServerViaApi(request, 'Test Server', 'localhost', SSH_PORT, 'root', 'testpass');
      const storagePath = path.join(TEST_BASE_PATH, 'backups');
      const storageLocationId = await createStorageLocationViaApi(request, 'Test Storage', storagePath);
      const namingRuleId = await createNamingRuleViaApi(request, 'Simple', '{profile}');
      const profileId = await createBackupProfileViaApi(request, 'TestBackup', serverId, storageLocationId, namingRuleId, [
        { remote_path: '/backup/db_backup.sql' },
      ]);

      // Run backup
      const runId = await runBackupViaApi(request, profileId);
      await waitForBackupRunComplete(request, runId);

      // Verify files exist before cleanup
      const filesBeforeCleanup = getAllFilesInDirectory(storagePath);
      expect(filesBeforeCleanup.length).toBe(1);
      const filePath = filesBeforeCleanup[0];

      // Set backup run date to 100 days ago (very old)
      const hundredDaysAgo = new Date();
      hundredDaysAgo.setDate(hundredDaysAgo.getDate() - 100);
      await updateBackupRunDate(request, runId, hundredDaysAgo);

      // Trigger retention cleanup
      await triggerRetentionCleanup(request);

      // Verify files still exist (no retention policy)
      expect(fileExistsOnDisk(filePath)).toBe(true);

      // Verify backup run is NOT marked as cleaned up
      const run = await getBackupRunViaApi(request, runId);
      expect(run.retention_cleaned_up).toBe(false);
    });
  });

  test.describe('Multiple Profiles', () => {
    test('should only delete files for profiles with retention policy', async ({ request }) => {
      // Setup
      const serverId = await createServerViaApi(request, 'Test Server', 'localhost', SSH_PORT, 'root', 'testpass');
      const storagePath = path.join(TEST_BASE_PATH, 'backups');
      const storageLocationId = await createStorageLocationViaApi(request, 'Test Storage', storagePath);
      const namingRuleId = await createNamingRuleViaApi(request, 'Simple', '{profile}');
      
      // Create two profiles - one with retention, one without
      const profileWithRetention = await createBackupProfileViaApi(
        request, 'WithRetention', serverId, storageLocationId, namingRuleId, 
        [{ remote_path: '/backup/db_backup.sql' }]
      );
      const profileWithoutRetention = await createBackupProfileViaApi(
        request, 'WithoutRetention', serverId, storageLocationId, namingRuleId,
        [{ remote_path: '/backup/config.json' }]
      );

      // Set retention only on first profile
      await updateBackupProfileViaApi(request, profileWithRetention, { retention_days: 7 });

      // Run backups for both profiles
      const runWithRetention = await runBackupViaApi(request, profileWithRetention);
      await waitForBackupRunComplete(request, runWithRetention);
      
      const runWithoutRetention = await runBackupViaApi(request, profileWithoutRetention);
      await waitForBackupRunComplete(request, runWithoutRetention);

      // Get files for each run
      const filesWithRetention = await getBackupRunFilesViaApi(request, runWithRetention);
      const filesWithoutRetention = await getBackupRunFilesViaApi(request, runWithoutRetention);
      
      expect(filesWithRetention.length).toBe(1);
      expect(filesWithoutRetention.length).toBe(1);

      // Set both backup runs to 10 days ago
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      await updateBackupRunDate(request, runWithRetention, tenDaysAgo);
      await updateBackupRunDate(request, runWithoutRetention, tenDaysAgo);

      // Trigger retention cleanup
      await triggerRetentionCleanup(request);

      // Verify files for retention profile are deleted
      expect(fileExistsOnDisk(filesWithRetention[0].local_path)).toBe(false);
      
      // Verify files for non-retention profile still exist
      expect(fileExistsOnDisk(filesWithoutRetention[0].local_path)).toBe(true);

      // Verify cleanup status
      const runWithRetentionAfter = await getBackupRunViaApi(request, runWithRetention);
      const runWithoutRetentionAfter = await getBackupRunViaApi(request, runWithoutRetention);
      
      expect(runWithRetentionAfter.retention_cleaned_up).toBe(true);
      expect(runWithoutRetentionAfter.retention_cleaned_up).toBe(false);
    });
  });

  test.describe('Multiple Runs', () => {
    test('should only delete old runs, keep recent ones', async ({ request }) => {
      // Setup - use two separate profiles with different storage paths to avoid file collision
      const serverId = await createServerViaApi(request, 'Test Server', 'localhost', SSH_PORT, 'root', 'testpass');
      const oldStoragePath = path.join(TEST_BASE_PATH, 'backups-old');
      const newStoragePath = path.join(TEST_BASE_PATH, 'backups-new');
      const oldStorageLocationId = await createStorageLocationViaApi(request, 'Old Storage', oldStoragePath);
      const newStorageLocationId = await createStorageLocationViaApi(request, 'New Storage', newStoragePath);
      const namingRuleId = await createNamingRuleViaApi(request, 'Simple', '{profile}');
      
      // Create profile for old backup
      const oldProfileId = await createBackupProfileViaApi(request, 'OldBackup', serverId, oldStorageLocationId, namingRuleId, [
        { remote_path: '/backup/db_backup.sql' },
      ]);
      await updateBackupProfileViaApi(request, oldProfileId, { retention_days: 7 });

      // Create profile for new backup  
      const newProfileId = await createBackupProfileViaApi(request, 'NewBackup', serverId, newStorageLocationId, namingRuleId, [
        { remote_path: '/backup/config.json' },
      ]);
      await updateBackupProfileViaApi(request, newProfileId, { retention_days: 7 });

      // Run old backup
      const oldRunId = await runBackupViaApi(request, oldProfileId);
      await waitForBackupRunComplete(request, oldRunId);
      
      // Run new backup
      const newRunId = await runBackupViaApi(request, newProfileId);
      await waitForBackupRunComplete(request, newRunId);

      // Get files for each run
      const oldFiles = await getBackupRunFilesViaApi(request, oldRunId);
      const newFiles = await getBackupRunFilesViaApi(request, newRunId);
      
      expect(oldFiles.length).toBe(1);
      expect(newFiles.length).toBe(1);

      // Set old run to 10 days ago, keep new run recent
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      await updateBackupRunDate(request, oldRunId, tenDaysAgo);

      // Trigger retention cleanup
      await triggerRetentionCleanup(request);

      // Verify old run files are deleted
      expect(fileExistsOnDisk(oldFiles[0].local_path)).toBe(false);
      
      // Verify new run files still exist
      expect(fileExistsOnDisk(newFiles[0].local_path)).toBe(true);

      // Verify cleanup status
      const oldRun = await getBackupRunViaApi(request, oldRunId);
      const newRun = await getBackupRunViaApi(request, newRunId);
      
      expect(oldRun.retention_cleaned_up).toBe(true);
      expect(newRun.retention_cleaned_up).toBe(false);
    });

    test('should not re-process already cleaned up runs', async ({ request }) => {
      // Setup
      const serverId = await createServerViaApi(request, 'Test Server', 'localhost', SSH_PORT, 'root', 'testpass');
      const storagePath = path.join(TEST_BASE_PATH, 'backups');
      const storageLocationId = await createStorageLocationViaApi(request, 'Test Storage', storagePath);
      const namingRuleId = await createNamingRuleViaApi(request, 'Simple', '{profile}');
      const profileId = await createBackupProfileViaApi(request, 'TestBackup', serverId, storageLocationId, namingRuleId, [
        { remote_path: '/backup/db_backup.sql' },
      ]);

      // Set retention policy to 7 days
      await updateBackupProfileViaApi(request, profileId, { retention_days: 7 });

      // Run backup
      const runId = await runBackupViaApi(request, profileId);
      await waitForBackupRunComplete(request, runId);

      // Set backup run date to 10 days ago
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      await updateBackupRunDate(request, runId, tenDaysAgo);

      // First cleanup - should process the run
      await triggerRetentionCleanup(request);

      // Verify run is cleaned up
      const runAfterFirst = await getBackupRunViaApi(request, runId);
      expect(runAfterFirst.retention_cleaned_up).toBe(true);

      // Second cleanup - should not re-process (would fail if it tried to delete files again)
      await triggerRetentionCleanup(request);

      // Still cleaned up
      const runAfterSecond = await getBackupRunViaApi(request, runId);
      expect(runAfterSecond.retention_cleaned_up).toBe(true);
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle retention at exact boundary (7 days)', async ({ request }) => {
      // Setup
      const serverId = await createServerViaApi(request, 'Test Server', 'localhost', SSH_PORT, 'root', 'testpass');
      const storagePath = path.join(TEST_BASE_PATH, 'backups');
      const storageLocationId = await createStorageLocationViaApi(request, 'Test Storage', storagePath);
      const namingRuleId = await createNamingRuleViaApi(request, 'Simple', '{profile}');
      const profileId = await createBackupProfileViaApi(request, 'TestBackup', serverId, storageLocationId, namingRuleId, [
        { remote_path: '/backup/db_backup.sql' },
      ]);

      // Set retention policy to 7 days
      await updateBackupProfileViaApi(request, profileId, { retention_days: 7 });

      // Run backup
      const runId = await runBackupViaApi(request, profileId);
      await waitForBackupRunComplete(request, runId);

      // Get files
      const files = await getBackupRunFilesViaApi(request, runId);
      expect(files.length).toBe(1);

      // Set backup run date to 6 days and 23 hours ago (just inside the 7-day boundary)
      // This ensures it's clearly within retention period even with timing variations
      const sixDaysAgo = new Date();
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
      sixDaysAgo.setHours(sixDaysAgo.getHours() - 23);
      await updateBackupRunDate(request, runId, sixDaysAgo);

      // Trigger retention cleanup
      await triggerRetentionCleanup(request);

      // Files within retention period should still exist
      // The logic uses "end_time < cutoff" so files from ~6.96 days ago should NOT be deleted
      expect(fileExistsOnDisk(files[0].local_path)).toBe(true);
      
      const run = await getBackupRunViaApi(request, runId);
      expect(run.retention_cleaned_up).toBe(false);
    });

    test('should handle multiple files per run', async ({ request }) => {
      // Setup
      const serverId = await createServerViaApi(request, 'Test Server', 'localhost', SSH_PORT, 'root', 'testpass');
      const storagePath = path.join(TEST_BASE_PATH, 'backups');
      const storageLocationId = await createStorageLocationViaApi(request, 'Test Storage', storagePath);
      const namingRuleId = await createNamingRuleViaApi(request, 'Simple', '{profile}');
      const profileId = await createBackupProfileViaApi(request, 'TestBackup', serverId, storageLocationId, namingRuleId, [
        { remote_path: '/backup/db_backup.sql' },
        { remote_path: '/backup/config.json' },
        { remote_path: '/backup/data.csv' },
      ]);

      // Set retention policy to 7 days
      await updateBackupProfileViaApi(request, profileId, { retention_days: 7 });

      // Run backup
      const runId = await runBackupViaApi(request, profileId);
      await waitForBackupRunComplete(request, runId);

      // Verify all files exist
      const files = await getBackupRunFilesViaApi(request, runId);
      expect(files.length).toBe(3);
      
      for (const file of files) {
        expect(fileExistsOnDisk(file.local_path)).toBe(true);
      }

      // Set backup run date to 10 days ago
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      await updateBackupRunDate(request, runId, tenDaysAgo);

      // Trigger retention cleanup
      await triggerRetentionCleanup(request);

      // Verify all files are deleted
      for (const file of files) {
        expect(fileExistsOnDisk(file.local_path)).toBe(false);
      }

      // Verify backup run is marked as cleaned up
      const run = await getBackupRunViaApi(request, runId);
      expect(run.retention_cleaned_up).toBe(true);
    });

    test('should handle zero retention days (disabled)', async ({ request }) => {
      // Setup
      const serverId = await createServerViaApi(request, 'Test Server', 'localhost', SSH_PORT, 'root', 'testpass');
      const storagePath = path.join(TEST_BASE_PATH, 'backups');
      const storageLocationId = await createStorageLocationViaApi(request, 'Test Storage', storagePath);
      const namingRuleId = await createNamingRuleViaApi(request, 'Simple', '{profile}');
      const profileId = await createBackupProfileViaApi(request, 'TestBackup', serverId, storageLocationId, namingRuleId, [
        { remote_path: '/backup/db_backup.sql' },
      ]);

      // Set retention to 0 (disabled)
      await updateBackupProfileViaApi(request, profileId, { retention_days: 0 });

      // Run backup
      const runId = await runBackupViaApi(request, profileId);
      await waitForBackupRunComplete(request, runId);

      // Get files
      const files = await getBackupRunFilesViaApi(request, runId);
      expect(files.length).toBe(1);

      // Set backup run date to 100 days ago
      const hundredDaysAgo = new Date();
      hundredDaysAgo.setDate(hundredDaysAgo.getDate() - 100);
      await updateBackupRunDate(request, runId, hundredDaysAgo);

      // Trigger retention cleanup
      await triggerRetentionCleanup(request);

      // Files should still exist (retention disabled with 0)
      expect(fileExistsOnDisk(files[0].local_path)).toBe(true);
      
      const run = await getBackupRunViaApi(request, runId);
      expect(run.retention_cleaned_up).toBe(false);
    });
  });
});
