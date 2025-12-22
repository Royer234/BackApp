import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import {
  Box,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { useMemo, useState } from 'react';
import type { BackupFile } from '../../types';

interface FileTreeProps {
  files: BackupFile[];
  rootLabel?: string;
  onDownload?: (fileId: number, filePath: string) => void;
  basePath?: string;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  size?: number;
  fileId?: number;
}

function buildTree(files: BackupFile[], basePath?: string): TreeNode {
  const root: TreeNode = { name: 'Contents', path: '', isDir: true, children: [] };

  const ensureDir = (parts: string[], base: TreeNode) => {
    let node = base;
    for (const part of parts) {
      if (!part) continue;
      let child = node.children.find((c) => c.isDir && c.name === part);
      if (!child) {
        child = { name: part, path: (node.path.endsWith('/') ? node.path : node.path + '/') + part, isDir: true, children: [] };
        node.children.push(child);
      }
      node = child;
    }
    return node;
  };

  for (const f of files) {
    const fullPath = (f.local_path || f.remote_path || '').trim();
    if (!fullPath) continue;
    // Normalize path
    const normalized = fullPath.replace(/\\/g, '/');
    
    // If basePath provided, strip it to show relative structure
    let pathToParse = normalized;
    if (basePath) {
      const normalizedBase = basePath.replace(/\\/g, '/').replace(/\/$/, '');
      if (normalized.startsWith(normalizedBase + '/')) {
        pathToParse = normalized.slice(normalizedBase.length + 1);
      }
    }
    
    const parts = pathToParse.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    const fileName = parts[parts.length - 1];
    const dirParts = parts.slice(0, -1);
    const dirNode = ensureDir(dirParts, root);

    // Add file node
    dirNode.children.push({
      name: fileName,
      path: normalized,
      isDir: false,
      children: [],
      size: f.size_bytes ?? f.file_size ?? 0,
      fileId: f.id,
    });
  }

  // Optionally sort directories first, then files
  const sortTree = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortTree);
  };
  sortTree(root);

  return root;
}

function TreeNodeView({ node, depth = 0, onDownload }: { node: TreeNode; depth?: number; onDownload?: (fileId: number, filePath: string) => void }) {
  const [open, setOpen] = useState(depth < 2); // expand first two levels by default

  if (!node.isDir) {
    return (
      <ListItem sx={{ pl: 2 + depth * 2 }}
        secondaryAction={
          onDownload && node.fileId ? (
            <Tooltip title="Download file">
              <IconButton edge="end" size="small" onClick={() => onDownload(node.fileId!, node.path)} aria-label={`Download ${node.name}`}>
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : undefined
        }
      >
        <ListItemIcon>
          <InsertDriveFileIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography variant="body2" fontFamily="monospace">
              {node.name}
            </Typography>
          }
          secondary={node.path}
        />
      </ListItem>
    );
  }

  return (
    <Box>
      <ListItemButton onClick={() => setOpen(!open)} sx={{ pl: 2 + depth * 2 }}>
        <ListItemIcon>
          <FolderIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography variant="body2" fontWeight={depth === 0 ? 'bold' : undefined}>
              {node.name === '/' ? 'Root' : node.name}
            </Typography>
          }
        />
        {open ? <ExpandLess /> : <ExpandMore />}
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List disablePadding>
          {node.children.map((child) => (
            <TreeNodeView key={child.path} node={child} depth={depth + 1} onDownload={onDownload} />
          ))}
        </List>
      </Collapse>
    </Box>
  );
}

export default function FileTree({ files, onDownload, basePath }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files, basePath), [files, basePath]);
  return (
    <List disablePadding>
      <TreeNodeView node={tree} onDownload={onDownload} />
    </List>
  );
}
