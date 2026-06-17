import { useState, useEffect } from 'react';
import { problemAPI, alertAPI } from '../api';

const Admin = () => {
  const [activeTab, setActiveTab] = useState('problems');
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProblem, setEditingProblem] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    input_format: '',
    output_format: '',
    time_limit: 1000,
    memory_limit: 128,
    sample_input: '',
    sample_output: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showTestCaseModal, setShowTestCaseModal] = useState(false);
  const [currentProblem, setCurrentProblem] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [testCasesLoading, setTestCasesLoading] = useState(false);

  const [showTestCaseForm, setShowTestCaseForm] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState(null);
  const [testCaseForm, setTestCaseForm] = useState({
    input_text: '',
    expected_output: '',
    is_sample: false
  });

  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertStats, setAlertStats] = useState(null);
  const [alertStatus, setAlertStatus] = useState('pending');
  const [alertPage, setAlertPage] = useState(1);
  const [alertTotalPages, setAlertTotalPages] = useState(1);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [selectedAlertIds, setSelectedAlertIds] = useState([]);

  useEffect(() => {
    fetchProblems();
    if (activeTab === 'alerts') {
      fetchAlertStats();
      fetchAlerts();
    }
  }, [activeTab, alertStatus, alertPage]);

  const fetchProblems = async () => {
    try {
      const response = await problemAPI.getAll();
      setProblems(response.data);
    } catch (error) {
      console.error('Failed to fetch problems:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProblem = () => {
    setEditingProblem(null);
    setFormData({
      title: '',
      description: '',
      input_format: '',
      output_format: '',
      time_limit: 1000,
      memory_limit: 128,
      sample_input: '',
      sample_output: ''
    });
    setShowModal(true);
    setError('');
    setSuccess('');
  };

  const handleEditProblem = (problem) => {
    setEditingProblem(problem);
    setFormData({
      title: problem.title,
      description: problem.description,
      input_format: problem.input_format,
      output_format: problem.output_format,
      time_limit: problem.time_limit,
      memory_limit: problem.memory_limit,
      sample_input: problem.sample_input,
      sample_output: problem.sample_output
    });
    setShowModal(true);
    setError('');
    setSuccess('');
  };

  const handleDeleteProblem = async (id) => {
    if (!confirm('确定要删除这道题目吗？相关的提交记录也会被删除。')) {
      return;
    }
    try {
      await problemAPI.delete(id);
      setSuccess('题目删除成功');
      fetchProblems();
    } catch (error) {
      setError(error.response?.data?.error || '删除失败');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (editingProblem) {
        await problemAPI.update(editingProblem.id, formData);
        setSuccess('题目更新成功');
      } else {
        await problemAPI.create(formData);
        setSuccess('题目创建成功');
      }
      setShowModal(false);
      fetchProblems();
    } catch (err) {
      setError(err.response?.data?.error || '操作失败');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'time_limit' || name === 'memory_limit' ? parseInt(value) : value
    }));
  };

  const handleManageTestCases = async (problem) => {
    setCurrentProblem(problem);
    setShowTestCaseModal(true);
    setError('');
    setSuccess('');
    await fetchTestCases(problem.id);
  };

  const fetchTestCases = async (problemId) => {
    setTestCasesLoading(true);
    try {
      const response = await problemAPI.getTestCases(problemId);
      setTestCases(response.data);
    } catch (error) {
      console.error('Failed to fetch test cases:', error);
      setError('获取测试用例失败');
    } finally {
      setTestCasesLoading(false);
    }
  };

  const handleAddTestCase = () => {
    setEditingTestCase(null);
    setTestCaseForm({
      input_text: '',
      expected_output: '',
      is_sample: false
    });
    setShowTestCaseForm(true);
  };

  const handleEditTestCase = (testCase) => {
    setEditingTestCase(testCase);
    setTestCaseForm({
      input_text: testCase.input_text,
      expected_output: testCase.expected_output,
      is_sample: testCase.is_sample
    });
    setShowTestCaseForm(true);
  };

  const handleDeleteTestCase = async (testCaseId) => {
    if (!confirm('确定要删除这个测试用例吗？')) {
      return;
    }
    try {
      await problemAPI.deleteTestCase(currentProblem.id, testCaseId);
      setSuccess('测试用例删除成功');
      fetchTestCases(currentProblem.id);
      fetchProblems();
    } catch (error) {
      setError(error.response?.data?.error || '删除失败');
    }
  };

  const handleTestCaseFormSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (editingTestCase) {
        await problemAPI.updateTestCase(currentProblem.id, editingTestCase.id, testCaseForm);
        setSuccess('测试用例更新成功');
      } else {
        await problemAPI.addTestCase(currentProblem.id, testCaseForm);
        setSuccess('测试用例添加成功');
      }
      setShowTestCaseForm(false);
      fetchTestCases(currentProblem.id);
      fetchProblems();
    } catch (err) {
      setError(err.response?.data?.error || '操作失败');
    }
  };

  const handleTestCaseFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setTestCaseForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleImportFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]);
    }
  };

  const handleImportTestCases = async () => {
    if (!importFile) {
      setError('请选择 ZIP 文件');
      return;
    }
    setImporting(true);
    setError('');
    setSuccess('');
    try {
      await problemAPI.importTestCases(currentProblem.id, importFile);
      setSuccess('测试用例导入成功');
      setImportFile(null);
      fetchTestCases(currentProblem.id);
      fetchProblems();
    } catch (err) {
      setError(err.response?.data?.error || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const fetchAlertStats = async () => {
    try {
      const response = await alertAPI.getStats();
      setAlertStats(response.data);
    } catch (error) {
      console.error('Failed to fetch alert stats:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      setAlertsLoading(true);
      const response = await alertAPI.getAll({
        status: alertStatus,
        page: alertPage,
        limit: 10
      });
      setAlerts(response.data.alerts);
      setAlertTotalPages(response.data.totalPages);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setAlertsLoading(false);
    }
  };

  const handleViewAlert = async (alertId) => {
    try {
      const response = await alertAPI.getById(alertId);
      setSelectedAlert(response.data);
      setShowAlertModal(true);
    } catch (error) {
      setError(error.response?.data?.error || '获取告警详情失败');
    }
  };

  const handleUpdateAlertStatus = async (alertId, status, notes = null) => {
    try {
      await alertAPI.updateStatus(alertId, { status, notes });
      setSuccess('告警状态更新成功');
      fetchAlerts();
      fetchAlertStats();
      if (selectedAlert?.id === alertId) {
        const response = await alertAPI.getById(alertId);
        setSelectedAlert(response.data);
      }
    } catch (error) {
      setError(error.response?.data?.error || '更新失败');
    }
  };

  const handleBatchUpdateStatus = async (status) => {
    if (selectedAlertIds.length === 0) {
      setError('请先选择要处理的告警');
      return;
    }
    try {
      await alertAPI.batchUpdateStatus({ ids: selectedAlertIds, status });
      setSuccess(`成功更新 ${selectedAlertIds.length} 条告警`);
      setSelectedAlertIds([]);
      fetchAlerts();
      fetchAlertStats();
    } catch (error) {
      setError(error.response?.data?.error || '批量更新失败');
    }
  };

  const toggleAlertSelect = (alertId) => {
    setSelectedAlertIds(prev =>
      prev.includes(alertId)
        ? prev.filter(id => id !== alertId)
        : [...prev, alertId]
    );
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'background: #fff3cd; color: #856404;',
      reviewed: 'background: #cce5ff; color: #004085;',
      dismissed: 'background: #e2e3e5; color: #383d41;',
      confirmed: 'background: #f8d7da; color: #721c24;'
    };
    const labels = {
      pending: '待处理',
      reviewed: '已查看',
      dismissed: '已忽略',
      confirmed: '已确认'
    };
    return (
      <span className="badge" style={styles[status] || {}}>
        {labels[status] || status}
      </span>
    );
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="admin-header">
        <h1 className="page-title" style={{ marginBottom: 0 }}>管理后台</h1>
        {activeTab === 'problems' && (
          <button className="btn btn-primary" onClick={handleAddProblem}>
            + 添加题目
          </button>
        )}
      </div>

      <div className="admin-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid #e1e5e9' }}>
        <button
          className={`btn ${activeTab === 'problems' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', marginBottom: '-2px' }}
          onClick={() => setActiveTab('problems')}
        >
          📝 题目管理
        </button>
        <button
          className={`btn ${activeTab === 'alerts' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', marginBottom: '-2px' }}
          onClick={() => { setActiveTab('alerts'); setAlertPage(1); }}
        >
          ⚠️ 代码查重告警
          {alertStats?.stats.pending > 0 && (
            <span style={{ marginLeft: '0.5rem', background: '#e74c3c', color: 'white', padding: '0.1rem 0.5rem', borderRadius: '10px', fontSize: '0.75rem' }}>
              {alertStats.stats.pending}
            </span>
          )}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {activeTab === 'problems' && (
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>题目管理</h2>
          
          {problems.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              暂无题目，点击上方按钮添加
            </p>
          ) : (
            <table className="submissions-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>标题</th>
                  <th>时间限制</th>
                  <th>内存限制</th>
                  <th>测试点数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((problem) => (
                  <tr key={problem.id}>
                    <td>#{problem.id}</td>
                    <td>{problem.title}</td>
                    <td>{problem.time_limit}ms</td>
                    <td>{problem.memory_limit}MB</td>
                    <td>
                      <span className="badge">{problem.test_case_count || 0}</span>
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEditProblem(problem)}
                        >
                          编辑
                        </button>
                        <button 
                          className="btn btn-primary btn-sm"
                          onClick={() => handleManageTestCases(problem)}
                        >
                          管理测试用例
                        </button>
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteProblem(problem.id)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'alerts' && (
        <div>
          {alertStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="stat-card">
                <div className="stat-number">{alertStats.stats.total}</div>
                <div className="stat-label">总告警数</div>
              </div>
              <div className="stat-card" style={{ background: '#fff3cd' }}>
                <div className="stat-number" style={{ color: '#856404' }}>{alertStats.stats.pending}</div>
                <div className="stat-label" style={{ color: '#856404' }}>待处理</div>
              </div>
              <div className="stat-card" style={{ background: '#cce5ff' }}>
                <div className="stat-number" style={{ color: '#004085' }}>{alertStats.stats.reviewed}</div>
                <div className="stat-label" style={{ color: '#004085' }}>已查看</div>
              </div>
              <div className="stat-card" style={{ background: '#f8d7da' }}>
                <div className="stat-number" style={{ color: '#721c24' }}>{alertStats.stats.confirmed}</div>
                <div className="stat-label" style={{ color: '#721c24' }}>已确认</div>
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ marginBottom: 0 }}>代码查重告警</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={alertStatus}
                  onChange={(e) => { setAlertStatus(e.target.value); setAlertPage(1); }}
                  style={{ padding: '0.5rem', borderRadius: '8px', border: '2px solid #e1e5e9' }}
                >
                  <option value="">全部状态</option>
                  <option value="pending">待处理</option>
                  <option value="reviewed">已查看</option>
                  <option value="dismissed">已忽略</option>
                  <option value="confirmed">已确认</option>
                </select>
                {selectedAlertIds.length > 0 && (
                  <>
                    <span style={{ fontSize: '0.875rem', color: '#666' }}>
                      已选择 {selectedAlertIds.length} 项
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleBatchUpdateStatus('reviewed')}
                    >
                      批量标记已查看
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleBatchUpdateStatus('confirmed')}
                    >
                      批量确认
                    </button>
                  </>
                )}
              </div>
            </div>

            {alertsLoading ? (
              <div className="loading"><div className="spinner"></div></div>
            ) : alerts.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                暂无告警记录
              </p>
            ) : (
              <>
                <table className="submissions-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedAlertIds.length === alerts.length && alerts.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAlertIds(alerts.map(a => a.id));
                            } else {
                              setSelectedAlertIds([]);
                            }
                          }}
                        />
                      </th>
                      <th>ID</th>
                      <th>题目</th>
                      <th>提交用户</th>
                      <th>匹配用户</th>
                      <th>相似度</th>
                      <th>汉明距离</th>
                      <th>状态</th>
                      <th>时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert) => (
                      <tr key={alert.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedAlertIds.includes(alert.id)}
                            onChange={() => toggleAlertSelect(alert.id)}
                          />
                        </td>
                        <td>#{alert.id}</td>
                        <td>{alert.problem_title}</td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{alert.user_name}</span>
                          <div style={{ fontSize: '0.75rem', color: '#999' }}>
                            提交 #{alert.submission_id}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{alert.matched_user_name}</span>
                          <div style={{ fontSize: '0.75rem', color: '#999' }}>
                            提交 #{alert.matched_submission_id}
                          </div>
                        </td>
                        <td>
                          <span style={{ 
                            color: alert.similarity_score >= 95 ? '#dc3545' : alert.similarity_score >= 90 ? '#fd7e14' : '#ffc107',
                            fontWeight: 'bold'
                          }}>
                            {alert.similarity_score}%
                          </span>
                        </td>
                        <td>{alert.hamming_distance}</td>
                        <td>{getStatusBadge(alert.status)}</td>
                        <td style={{ fontSize: '0.875rem', color: '#666' }}>
                          {new Date(alert.created_at).toLocaleString()}
                        </td>
                        <td>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleViewAlert(alert.id)}
                          >
                            查看详情
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {alertTotalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={alertPage === 1}
                      onClick={() => setAlertPage(p => Math.max(1, p - 1))}
                    >
                      上一页
                    </button>
                    <span style={{ padding: '0.5rem 1rem', color: '#666' }}>
                      {alertPage} / {alertTotalPages}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={alertPage === alertTotalPages}
                      onClick={() => setAlertPage(p => Math.min(alertTotalPages, p + 1))}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingProblem ? '编辑题目' : '添加题目'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>题目标题</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>题目描述</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={5}
                  required
                />
              </div>

              <div className="form-group">
                <label>输入格式</label>
                <textarea
                  name="input_format"
                  value={formData.input_format}
                  onChange={handleChange}
                  rows={3}
                  required
                />
              </div>

              <div className="form-group">
                <label>输出格式</label>
                <textarea
                  name="output_format"
                  value={formData.output_format}
                  onChange={handleChange}
                  rows={3}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>时间限制 (ms)</label>
                  <input
                    type="number"
                    name="time_limit"
                    value={formData.time_limit}
                    onChange={handleChange}
                    min="100"
                    max="10000"
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>内存限制 (MB)</label>
                  <input
                    type="number"
                    name="memory_limit"
                    value={formData.memory_limit}
                    onChange={handleChange}
                    min="16"
                    max="1024"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>样例输入</label>
                <textarea
                  name="sample_input"
                  value={formData.sample_input}
                  onChange={handleChange}
                  rows={3}
                  required
                />
              </div>

              <div className="form-group">
                <label>样例输出</label>
                <textarea
                  name="sample_output"
                  value={formData.sample_output}
                  onChange={handleChange}
                  rows={3}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingProblem ? '更新' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTestCaseModal && (
        <div className="modal-overlay" onClick={() => setShowTestCaseModal(false)}>
          <div className="modal-content" style={{ maxWidth: '900px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>管理测试用例 - {currentProblem?.title}</h2>
              <button className="modal-close" onClick={() => setShowTestCaseModal(false)}>
                ×
              </button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={handleAddTestCase}>
                + 添加测试用例
              </button>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleImportFileChange}
                  style={{ display: 'none' }}
                  id="zip-import"
                />
                <label htmlFor="zip-import" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-block' }}>
                  选择 ZIP 文件
                </label>
                {importFile && (
                  <span style={{ fontSize: '0.875rem', color: '#666' }}>
                    {importFile.name}
                  </span>
                )}
                <button 
                  className="btn btn-primary btn-sm" 
                  onClick={handleImportTestCases}
                  disabled={!importFile || importing}
                >
                  {importing ? '导入中...' : '批量导入'}
                </button>
              </div>
            </div>

            {showTestCaseForm && (
              <div className="card" style={{ marginBottom: '1.5rem', background: '#f8f9fa' }}>
                <h3 style={{ marginBottom: '1rem' }}>
                  {editingTestCase ? '编辑测试用例' : '添加测试用例'}
                </h3>
                <form onSubmit={handleTestCaseFormSubmit}>
                  <div className="form-group">
                    <label>输入文本</label>
                    <textarea
                      name="input_text"
                      value={testCaseForm.input_text}
                      onChange={handleTestCaseFormChange}
                      rows={3}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>期望输出</label>
                    <textarea
                      name="expected_output"
                      value={testCaseForm.expected_output}
                      onChange={handleTestCaseFormChange}
                      rows={3}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        name="is_sample"
                        checked={testCaseForm.is_sample}
                        onChange={handleTestCaseFormChange}
                      />
                      是否为样例
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={() => setShowTestCaseForm(false)}
                    >
                      取消
                    </button>
                    <button type="submit" className="btn btn-primary">
                      {editingTestCase ? '更新' : '添加'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {testCasesLoading ? (
              <div className="loading"><div className="spinner"></div></div>
            ) : testCases.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                暂无测试用例
              </p>
            ) : (
              <div className="test-case-grid">
                {testCases.map((tc, index) => (
                  <div key={tc.id} className="test-case-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <strong>
                        测试点 #{index + 1}
                        {tc.is_sample && <span className="badge" style={{ marginLeft: '0.5rem' }}>样例</span>}
                      </strong>
                      <div className="admin-actions">
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEditTestCase(tc)}
                        >
                          编辑
                        </button>
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteTestCase(tc.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#667eea', fontWeight: 600, marginBottom: '0.25rem' }}>输入</div>
                        <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: '0.75rem', borderRadius: '6px', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '120px', overflow: 'auto' }}>
                          {tc.input_text}
                        </pre>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#667eea', fontWeight: 600, marginBottom: '0.25rem' }}>期望输出</div>
                        <pre style={{ background: '#1e1e2e', color: '#cdd6f4', padding: '0.75rem', borderRadius: '6px', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '120px', overflow: 'auto' }}>
                          {tc.expected_output}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showAlertModal && selectedAlert && (
        <div className="modal-overlay" onClick={() => setShowAlertModal(false)}>
          <div className="modal-content" style={{ maxWidth: '1000px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>代码查重告警详情 #{selectedAlert.id}</h2>
              <button className="modal-close" onClick={() => setShowAlertModal(false)}>
                ×
              </button>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <span style={{ marginRight: '1rem' }}>
                    <strong>题目:</strong> {selectedAlert.problem_title}
                  </span>
                  <span style={{ marginRight: '1rem' }}>
                    <strong>相似度:</strong> 
                    <span style={{ 
                      color: selectedAlert.similarity_score >= 95 ? '#dc3545' : selectedAlert.similarity_score >= 90 ? '#fd7e14' : '#ffc107',
                      fontWeight: 'bold',
                      marginLeft: '0.5rem'
                    }}>
                      {selectedAlert.similarity_score}%
                    </span>
                  </span>
                  <span>
                    <strong>汉明距离:</strong> {selectedAlert.hamming_distance}
                  </span>
                </div>
                {getStatusBadge(selectedAlert.status)}
              </div>

              {selectedAlert.reviewed_by && (
                <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '1rem' }}>
                  <strong>审核人:</strong> {selectedAlert.reviewer_name} | 
                  <strong> 审核时间:</strong> {new Date(selectedAlert.reviewed_at).toLocaleString()}
                  {selectedAlert.notes && (
                    <><br /><strong>备注:</strong> {selectedAlert.notes}</>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <div style={{ background: '#f8d7da', color: '#721c24', padding: '0.75rem', borderRadius: '8px 8px 0 0', fontWeight: 600 }}>
                    ⚠️ 提交用户: {selectedAlert.user_name} (提交 #{selectedAlert.submission_id})
                    <div style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.8 }}>
                      {new Date(selectedAlert.submission_created_at).toLocaleString()}
                    </div>
                  </div>
                  <pre className="code-block" style={{ borderRadius: '0 0 8px 8px', maxHeight: '300px' }}>
                    {selectedAlert.submission_code}
                  </pre>
                </div>
                <div>
                  <div style={{ background: '#cce5ff', color: '#004085', padding: '0.75rem', borderRadius: '8px 8px 0 0', fontWeight: 600 }}>
                    🔍 匹配用户: {selectedAlert.matched_user_name} (提交 #{selectedAlert.matched_submission_id})
                    <div style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.8 }}>
                      {new Date(selectedAlert.matched_created_at).toLocaleString()}
                    </div>
                  </div>
                  <pre className="code-block" style={{ borderRadius: '0 0 8px 8px', maxHeight: '300px' }}>
                    {selectedAlert.matched_code}
                  </pre>
                </div>
              </div>
            </div>

            {selectedAlert.status === 'pending' && (
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleUpdateAlertStatus(selectedAlert.id, 'dismissed')}
                >
                  忽略
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleUpdateAlertStatus(selectedAlert.id, 'reviewed')}
                >
                  标记已查看
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleUpdateAlertStatus(selectedAlert.id, 'confirmed')}
                >
                  确认雷同
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
