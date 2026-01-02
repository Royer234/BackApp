package controller

import (
	"net/http"
	"strconv"
	"time"

	"backapp-server/entity"
	"backapp-server/service"

	"github.com/gin-gonic/gin"
)

func handleResetDatabase(c *gin.Context) {
	service.ResetDatabase()
	c.JSON(http.StatusOK, gin.H{"status": "database reset"})
}

// handleTriggerRetentionCleanup triggers the retention cleanup process immediately
func handleTriggerRetentionCleanup(c *gin.Context) {
	cleanup := service.NewRetentionCleanup()
	cleanup.RunCleanup()
	c.JSON(http.StatusOK, gin.H{"status": "retention cleanup completed"})
}

// handleUpdateBackupRunDate updates the end_time of a backup run for testing retention
func handleUpdateBackupRunDate(c *gin.Context) {
	runIdStr := c.Param("id")
	runId, err := strconv.ParseUint(runIdStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid run ID"})
		return
	}

	var input struct {
		EndTime string `json:"end_time"` // RFC3339 format
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	endTime, err := time.Parse(time.RFC3339, input.EndTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_time format, use RFC3339"})
		return
	}

	var run entity.BackupRun
	if err := service.DB.First(&run, runId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "backup run not found"})
		return
	}

	if err := service.DB.Model(&run).Update("end_time", endTime).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update end_time"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":   "end_time updated",
		"run_id":   run.ID,
		"end_time": endTime.Format(time.RFC3339),
	})
}
