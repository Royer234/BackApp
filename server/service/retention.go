package service

import (
	"log"
	"time"

	"backapp-server/entity"
)

// RetentionCleanup handles automatic deletion of old backup files
type RetentionCleanup struct{}

// NewRetentionCleanup creates a new retention cleanup service
func NewRetentionCleanup() *RetentionCleanup {
	return &RetentionCleanup{}
}

// RunCleanup checks all backup profiles and deletes files older than retention period
func (r *RetentionCleanup) RunCleanup() {
	log.Println("Starting retention cleanup...")

	var profiles []entity.BackupProfile
	if err := DB.Find(&profiles).Error; err != nil {
		log.Printf("Failed to load backup profiles for retention cleanup: %v", err)
		return
	}

	for _, profile := range profiles {
		if profile.RetentionDays == nil || *profile.RetentionDays <= 0 {
			// No retention policy, skip
			continue
		}

		r.cleanupProfile(&profile)
	}

	log.Println("Retention cleanup completed")
}

// cleanupProfile deletes old backup files for a specific profile
func (r *RetentionCleanup) cleanupProfile(profile *entity.BackupProfile) {
	retentionDays := *profile.RetentionDays
	cutoffTime := time.Now().AddDate(0, 0, -retentionDays)

	log.Printf("Cleaning up profile %s (ID: %d) - retention: %d days, cutoff: %s",
		profile.Name, profile.ID, retentionDays, cutoffTime.Format(time.RFC3339))

	// Find backup runs older than the retention period that haven't been cleaned up yet
	var oldRuns []entity.BackupRun
	if err := DB.Where("backup_profile_id = ? AND end_time < ? AND status = ? AND retention_cleaned_up = ?",
		profile.ID, cutoffTime, "completed", false).
		Preload("BackupFiles").
		Find(&oldRuns).Error; err != nil {
		log.Printf("Failed to find old backup runs for profile %d: %v", profile.ID, err)
		return
	}

	if len(oldRuns) == 0 {
		log.Printf("No old backup runs found for profile %d", profile.ID)
		return
	}

	log.Printf("Found %d old backup runs to clean up for profile %d", len(oldRuns), profile.ID)

	for _, run := range oldRuns {
		r.cleanupRun(&run)
	}
}

// cleanupRun deletes all files associated with a backup run using existing service function
func (r *RetentionCleanup) cleanupRun(run *entity.BackupRun) {
	log.Printf("Cleaning up backup run %d (ended: %s)", run.ID, run.EndTime.Format(time.RFC3339))

	deletedFiles := 0
	deletedBytes := int64(0)

	for _, file := range run.BackupFiles {
		if file.Deleted {
			continue // Already deleted
		}

		// Use existing service function to delete the file
		if err := ServiceDeleteBackupFile(file.ID); err != nil {
			log.Printf("Failed to delete backup file %d: %v", file.ID, err)
			continue
		}

		deletedFiles++
		deletedBytes += file.SizeBytes
	}

	// Mark the run as cleaned up
	if err := DB.Model(run).Update("retention_cleaned_up", true).Error; err != nil {
		log.Printf("Failed to mark backup run %d as cleaned up: %v", run.ID, err)
	}

	log.Printf("Deleted %d files (%.2f MB) from backup run %d",
		deletedFiles, float64(deletedBytes)/(1024*1024), run.ID)
}

// StartRetentionScheduler starts a goroutine that runs retention cleanup periodically
func StartRetentionScheduler() {
	cleanup := NewRetentionCleanup()

	// Run cleanup once at startup
	go cleanup.RunCleanup()

	// Then run every hour
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()

		for range ticker.C {
			cleanup.RunCleanup()
		}
	}()
}
