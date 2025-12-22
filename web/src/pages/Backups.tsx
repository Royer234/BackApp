import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useEffect, useState } from 'react';
import { backupProfileApi, backupRunApi, storageLocationApi } from '../api';
import type { BackupProfile, BackupRun, BackupFile, StorageLocation } from '../types';
import FileTree from '../components/backups/FileTree';

export default function Backups() {
  const [profiles, setProfiles] = useState<BackupProfile[]>([]);
  const [locations, setLocations] = useState<Record<number, StorageLocation>>({});
  const [runsByProfile, setRunsByProfile] = useState<Record<number, BackupRun[]>>({});
  const [filesByRun, setFilesByRun] = useState<Record<number, BackupFile[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    let interval: number | undefined;
    if (autoRefresh) {
      interval = window.setInterval(async () => {
        await Promise.all(
          profiles.map(async (p) => {
            const runs = await backupRunApi.list({ profileId: p.id });
            setRunsByProfile((prev) => ({ ...prev, [p.id]: runs }));
          })
        );
      }, 5000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [autoRefresh, profiles]);

  const loadInitial = async () => {
    try {
      setLoading(true);
      const [profilesData, locationsData] = await Promise.all([
        backupProfileApi.list(),
        storageLocationApi.list(),
      ]);

      setProfiles(profilesData || []);
      const locMap = Object.fromEntries((locationsData || []).map((l) => [l.id, l]));
      setLocations(locMap);

      // Preload runs for each profile
      const runsEntries = await Promise.all(
        (profilesData || []).map(async (p) => {
          const runs = await backupRunApi.list({ profileId: p.id });
          return [p.id, runs] as const;
        })
      );
      setRunsByProfile(Object.fromEntries(runsEntries));

      setError(null);
    } catch (err) {
      console.error('Error loading backups page:', err);
      setError('Failed to load backups data');
    } finally {
      setLoading(false);
    }
  };

  const loadFilesForRun = async (runId: number) => {
    if (filesByRun[runId]) return; // skip if already loaded
    try {
      const files = await backupRunApi.getFiles(runId);
      setFilesByRun((prev) => ({ ...prev, [runId]: files || [] }));
    } catch (err) {
      console.error('Error loading files for run', runId, err);
    }
  };

  const handleDownloadFile = (fileId: number, filePath: string) => {
    const downloadUrl = `/api/v1/backup-files/${fileId}/download`;
    const fileName = filePath.split('/').pop() || 'download';
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" py={12}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={1}>
          <FolderOpenIcon />
          <Typography variant="h4" component="h3">Backups</Typography>
        </Box>
        <Tooltip title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}>
          <IconButton onClick={() => setAutoRefresh(!autoRefresh)} color={autoRefresh ? 'primary' : 'default'}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {profiles.length === 0 ? (
        <Alert severity="info">No backup profiles found.</Alert>
      ) : (
        <Grid container spacing={3}>
          {profiles.map((profile) => {
            const location = locations[profile.storage_location_id];
            const runs = runsByProfile[profile.id] || [];
            return (
              <Grid key={profile.id} size={{ xs: 12 }}>
                <Card>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Box>
                        <Typography variant="h6">{profile.name}</Typography>
                        {location && (
                          <Typography variant="body2" color="text.secondary">
                            Storage: {location.name} ({location.base_path})
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    {runs.length === 0 ? (
                      <Alert severity="info">No backup runs for this profile.</Alert>
                    ) : (
                      <Box>
                        {runs.map((run) => {
                          const files = filesByRun[run.id] || [];
                          return (
                            <Accordion key={run.id} onChange={(_, expanded) => expanded && loadFilesForRun(run.id)}>
                              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Box display="flex" alignItems="center" gap={2}>
                                  <Typography variant="subtitle1">Run #{run.id}</Typography>
                                  <Divider orientation="vertical" flexItem />
                                  <Typography variant="body2" color="text.secondary">
                                    Status: {run.status}
                                  </Typography>
                                </Box>
                              </AccordionSummary>
                              <AccordionDetails>
                                {files.length === 0 ? (
                                  <Typography color="text.secondary">No files recorded for this run.</Typography>
                                ) : (
                                  <FileTree files={files} onDownload={handleDownloadFile} basePath={location?.base_path} />
                                )}
                              </AccordionDetails>
                            </Accordion>
                          );
                        })}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
