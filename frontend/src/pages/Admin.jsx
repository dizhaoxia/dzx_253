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
                    <div className="admin-actions">
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleEditProblem(problem)}
                      >
                        编辑
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
    </div>
  );
};

export default Admin;
