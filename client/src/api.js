// api.js — Backend API request helpers
import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 30000 });

export async function getVideoInfo(url) {
  const res = await api.get('/info', { params: { url } });
  // Reference backend wraps in { success, data } but ours returns data directly
  // Support both shapes
  return res.data.data ?? res.data;
}

export async function createDownload(payload) {
  const res = await api.post('/download', payload);
  return res.data;
}

export async function getTaskStatus(taskId) {
  const res = await api.get(`/download/${taskId}`);
  return res.data.data ?? res.data;
}

export async function getLyrics(title, artist, source = 'auto') {
  const res = await api.get('/lyrics', { params: { title, artist, source } });
  return res.data;
}

export async function getQueueStatus() {
  const res = await api.get('/tasks');
  return res.data;
}
