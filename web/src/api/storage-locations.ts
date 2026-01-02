import type { StorageLocation, StorageLocationCreateInput } from '../types/storage-location';
import type { DeletionImpact, StorageLocationMoveImpact } from '../types/deletion-impact';
import { fetchJSON, fetchWithoutResponse } from './client';

export const storageLocationApi = {
  async list(): Promise<StorageLocation[]> {
    return fetchJSON<StorageLocation[]>('/storage-locations');
  },

  async create(data: StorageLocationCreateInput): Promise<StorageLocation> {
    return fetchJSON<StorageLocation>('/storage-locations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  },

  async update(id: number, data: StorageLocationCreateInput): Promise<StorageLocation> {
    return fetchJSON<StorageLocation>(`/storage-locations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  },

  async getMoveImpact(id: number, newPath: string): Promise<StorageLocationMoveImpact> {
    return fetchJSON<StorageLocationMoveImpact>(`/storage-locations/${id}/move-impact?new_path=${encodeURIComponent(newPath)}`);
  },

  async getDeletionImpact(id: number): Promise<DeletionImpact> {
    return fetchJSON<DeletionImpact>(`/storage-locations/${id}/deletion-impact`);
  },

  async delete(id: number): Promise<boolean> {
    return fetchWithoutResponse(`/storage-locations/${id}`, {
      method: 'DELETE',
    });
  },
};
