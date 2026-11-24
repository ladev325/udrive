// Thin wrapper around fetch for the udrive C# API (same origin; the session is an HttpOnly cookie).

export const UNAUTHORIZED_EVENT = 'udrive:unauthorized';

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function signalUnauthorized(path, status) {
  // A protected call failed because the session is gone: let the app return to the login screen.
  if (status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

export async function apiRequest(path, { method = 'GET', json, body, headers = {}, signal } = {}) {
  const allHeaders = { ...headers };
  let payload = body;
  if (json !== undefined) {
    allHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(json);
  }

  let response;
  try {
    response = await fetch(path, { method, headers: allHeaders, body: payload, credentials: 'same-origin', signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR', 0);
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    signalUnauthorized(path, response.status);
    throw new ApiError(data?.error || `HTTP_${response.status}`, response.status);
  }
  return data;
}

// Uploads a raw body with progress (fetch can't report upload progress). Resolves with the JSON answer.
export function uploadWithProgress(url, body, { headers = {}, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // not JSON
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        signalUnauthorized(url, xhr.status);
        reject(new ApiError(data?.error || (xhr.status === 413 ? 'FILE_TOO_LARGE' : `HTTP_${xhr.status}`), xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError('NETWORK_ERROR', 0));
    xhr.onabort = () => reject(new ApiError('ABORTED', 0));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(body);
  });
}

// ---- drive ----------------------------------------------------------------------

const enc = encodeURIComponent;

// Server item -> the shape the tabs use (photos read `title`, files read `name`).
export function toClientItem(meta) {
  return {
    id: meta.id,
    name: meta.name,
    title: meta.name,
    isFolder: meta.isFolder,
    isImage: meta.isImage,
    rawSize: meta.size,
    mime: meta.mime,
    parentId: meta.parentId,
    createdAt: meta.createdAt,
    modifiedAt: meta.modifiedAt,
    isSaved: meta.isSaved,
    trashedAt: meta.trashedAt,
    expiresAt: meta.expiresAt,
    previewUrl: meta.isImage ? `/api/drive/items/${enc(meta.id)}/content` : null,
    downloadUrl: meta.isFolder
      ? `/api/drive/items/${enc(meta.id)}/zip`
      : `/api/drive/items/${enc(meta.id)}/content?download=true`,
  };
}

const list = (data) => (Array.isArray(data) ? data.map(toClientItem) : []);

export const getStorage = () => apiRequest('/api/storage');

// Asks the server whether files of these sizes fit (max file size and quota) before uploading.
export const checkUpload = (sizes) => apiRequest('/api/drive/upload-check', { method: 'POST', json: { sizes } });

export async function listFolder(folderId) {
  const data = await apiRequest(`/api/drive/folder${folderId ? `?id=${enc(folderId)}` : ''}`);
  return { folder: data.folder ? toClientItem(data.folder) : null, path: data.path, items: list(data.items) };
}

export const listAllFolders = () => apiRequest('/api/drive/folders');
export const listPhotos = async () => list(await apiRequest('/api/drive/photos'));
export const listSaved = async () => list(await apiRequest('/api/drive/saved'));
export const listTrash = async () => list(await apiRequest('/api/drive/trash'));

export const createFolder = async (parentId, name) =>
  toClientItem(await apiRequest('/api/drive/folders', { method: 'POST', json: { parentId, name } }));

export async function uploadFile(file, parentId, { onProgress, signal } = {}) {
  const query = `name=${enc(file.name)}${parentId ? `&parentId=${enc(parentId)}` : ''}`;
  const meta = await uploadWithProgress(`/api/drive/upload?${query}`, file, {
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    onProgress,
    signal,
  });
  return toClientItem(meta);
}

export const renameItem = async (id, name) =>
  toClientItem(await apiRequest(`/api/drive/items/${enc(id)}/rename`, { method: 'POST', json: { name } }));

export const moveItem = async (id, parentId) =>
  toClientItem(await apiRequest(`/api/drive/items/${enc(id)}/move`, { method: 'POST', json: { parentId } }));

export const setItemSaved = async (id, isSaved) =>
  toClientItem(await apiRequest(`/api/drive/items/${enc(id)}/saved`, { method: 'POST', json: { isSaved } }));

// "Delete" in the drive moves the item to the trash.
export const trashItem = (id) => apiRequest(`/api/drive/items/${enc(id)}`, { method: 'DELETE' });

export const restoreItem = async (id) =>
  toClientItem(await apiRequest(`/api/drive/trash/${enc(id)}/restore`, { method: 'POST' }));
export const deleteForever = (id) => apiRequest(`/api/drive/trash/${enc(id)}`, { method: 'DELETE' });
export const emptyTrash = () => apiRequest('/api/drive/trash', { method: 'DELETE' });

// Starts a browser download of a file, or of a folder as ZIP (the server sends it as an attachment).
export function downloadItem(item) {
  if (!item?.downloadUrl) return false;
  const link = document.createElement('a');
  link.href = item.downloadUrl;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}
