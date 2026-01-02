package entity

import "time"

// BackupRun represents each execution of a backup profile
type BackupRun struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	BackupProfileID    uint      `gorm:"not null;constraint:OnDelete:CASCADE" json:"backup_profile_id"`
	StartTime          time.Time `json:"start_time"`
	EndTime            time.Time `json:"end_time"`
	Status             string    `gorm:"type:text" json:"status"`
	LocalBackupPath    string    `json:"local_backup_path,omitempty"`
	TotalFiles         int       `json:"total_files"`
	TotalSizeBytes     int64     `json:"total_size_bytes"`
	ErrorMessage       string    `json:"error_message,omitempty"`
	Log                string    `json:"log,omitempty"`
	RetentionCleanedUp bool      `gorm:"default:false" json:"retention_cleaned_up"`

	BackupFiles []BackupFile `gorm:"foreignKey:BackupRunID;constraint:OnDelete:CASCADE" json:"backup_files,omitempty"`
}
