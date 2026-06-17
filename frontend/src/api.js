import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me')
};

export const problemAPI = {
  getAll: () => api.get('/problems'),
  getById: (id) => api.get(`/problems/${id}`),
  create: (data) => api.post('/problems', data),
  update: (id, data) => api.put(`/problems/${id}`, data),
  delete: (id) => api.delete(`/problems/${id}`),
  getTestCases: (id) => api.get(`/problems/${id}/test-cases`),
  addTestCase: (id, data) => api.post(`/problems/${id}/test-cases`, data),
  updateTestCase: (id, testCaseId, data) => api.put(`/problems/${id}/test-cases/${testCaseId}`, data),
  deleteTestCase: (id, testCaseId) => api.delete(`/problems/${id}/test-cases/${testCaseId}`),
  importTestCases: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/problems/${id}/import-testcases`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};

export const submissionAPI = {
  submit: (data) => api.post('/submissions', data),
  getById: (id) => api.get(`/submissions/${id}`),
  getAll: (params) => api.get('/submissions', { params })
};

export const rankingAPI = {
  getAll: () => api.get('/rankings'),
  getUserStats: (userId) => api.get(`/rankings/user/${userId}`),
  refresh: () => api.post('/rankings/refresh')
};

export const roomAPI = {
  getAll: () => api.get('/rooms'),
  getByCode: (roomCode) => api.get(`/rooms/${roomCode}`),
  create: (data) => api.post('/rooms', data),
  join: (roomCode) => api.post(`/rooms/${roomCode}/join`),
  leave: (roomCode) => api.post(`/rooms/${roomCode}/leave`),
  startCompetition: (roomCode) => api.post(`/rooms/${roomCode}/start`),
  endCompetition: (roomCode) => api.post(`/rooms/${roomCode}/end`),
  getRankings: (roomCode) => api.get(`/rooms/${roomCode}/rankings`)
};

export const alertAPI = {
  getStats: () => api.get('/alerts/stats'),
  getAll: (params) => api.get('/alerts', { params }),
  getById: (id) => api.get(`/alerts/${id}`),
  updateStatus: (id, data) => api.put(`/alerts/${id}/status`, data),
  batchUpdateStatus: (data) => api.post('/alerts/batch-status', data)
};

export default api;
