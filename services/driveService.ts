/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

export const listDriveFiles = async (token: string): Promise<DriveFileItem[]> => {
  const query = encodeURIComponent("mimeType != 'application/vnd.google-apps.folder' and trashed = false");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=100&q=${query}&fields=files(id,name,mimeType,webViewLink)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Drive API error (status ${res.status})`);
  }
  const data = await res.json();
  return data.files || [];
};

export const getDriveFileContent = async (fileId: string, mimeType: string, token: string): Promise<string> => {
  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  if (mimeType === 'application/vnd.google-apps.document' || mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exportMime = mimeType === 'application/vnd.google-apps.document' ? 'text/plain' : 'text/csv';
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${exportMime}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!res.ok) {
    throw new Error(`Failed to download file content (status ${res.status})`);
  }
  
  return await res.text();
};
