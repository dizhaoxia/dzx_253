import { useState, useEffect } from 'react';
import { problemAPI } from '../api';

const Admin = () => {
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

  useEffect(() => {
    fetchProblems();
  }, []);

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

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="admin-header">
        <h1 className="page-title" style={{ marginBottom: 0 }}>管理后台</h1>
        <button className="btn btn-primary" onClick={handleAddProblem}>
          + 添加题目
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

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
    </div>
  );
};

export default Admin;
