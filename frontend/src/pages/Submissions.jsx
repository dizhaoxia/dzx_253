import { useState, useEffect } from 'react';
import { submissionAPI } from '../api';
import { useAuth } from '../context/AuthContext';

const STATUS_MAP = {
  AC: { label: 'Accepted', class: 'accepted', chinese: '通过' },
  WA: { label: 'Wrong Answer', class: 'wrong-answer', chinese: '答案错误' },
  CE: { label: 'Compile Error', class: 'compile-error', chinese: '编译错误' },
  RE: { label: 'Runtime Error', class: 'runtime-error', chinese: '运行时错误' },
  TLE: { label: 'Time Limit Exceeded', class: 'time-limit-exceeded', chinese: '超时' },
  MLE: { label: 'Memory Limit Exceeded', class: 'memory-limit-exceeded', chinese: '内存超限' },
  PE: { label: 'Presentation Error', class: 'presentation-error', chinese: '格式错误' },
  Pending: { label: 'Pending', class: 'pending', chinese: '等待判题' },
  Judging: { label: 'Judging', class: 'judging', chinese: '判题中' },
  'Judge Error': { label: 'Judge Error', class: 'judge-error', chinese: '判题错误' }
};

const getStatusInfo = (status) => {
  return STATUS_MAP[status] || { label: status, class: '', chinese: status };
};

const getStatusClass = (status) => {
  return getStatusInfo(status).class;
};

const Submissions = () => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { user } = useAuth();

  const fetchSubmissions = async () => {
    try {
      const response = await submissionAPI.getAll({ user_id: user.id });
      setSubmissions(response.data);
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [user.id]);

  useEffect(() => {
    const handleSubmissionUpdated = (event) => {
      const data = event.detail;
      if (data && data.submission_id) {
        setSubmissions(prev => {
          const updated = prev.map(sub => {
            if (sub.id === data.submission_id) {
              return {
                ...sub,
                status: data.status || sub.status,
                display_status: data.display_status || sub.display_status,
                score: data.score !== undefined ? data.score : sub.score,
                time_used: data.time_used !== undefined ? data.time_used : sub.time_used,
                memory_used: data.memory_used !== undefined ? data.memory_used : sub.memory_used
              };
            }
            return sub;
          });
          updated.sort((a, b) => b.id - a.id);
          return updated;
        });
      }
    };

    window.addEventListener('submission_updated', handleSubmissionUpdated);
    return () => window.removeEventListener('submission_updated', handleSubmissionUpdated);
  }, []);

  const handleRowClick = async (submission) => {
    if (selectedSubmission && selectedSubmission.id === submission.id) {
      setSelectedSubmission(null);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await submissionAPI.getById(submission.id);
      setSelectedSubmission(response.data);
    } catch (error) {
      console.error('Failed to fetch submission detail:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedSubmission(null);
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <h1 className="page-title">我的提交记录</h1>
      
      {submissions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>暂无提交记录</p>
        </div>
      ) : (
        <table className="submissions-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>题目</th>
              <th>语言</th>
              <th>状态</th>
              <th>分数</th>
              <th>耗时</th>
              <th>提交时间</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((sub) => (
              <tr 
                key={sub.id} 
                className="submission-row"
                onClick={() => handleRowClick(sub)}
              >
                <td>#{sub.id}</td>
                <td>{sub.problem_title}</td>
                <td>{sub.language === 'cpp' ? 'C++' : 'Python'}</td>
                <td>
                  <span className={`status-badge status-${getStatusClass(sub.status)}`}>
                    {sub.display_status || getStatusInfo(sub.status).label}
                  </span>
                </td>
                <td>
                  <span className={`score-badge score-${sub.score >= 100 ? 'full' : sub.score >= 60 ? 'pass' : 'fail'}`}>
                    {sub.score}%
                  </span>
                </td>
                <td>{sub.time_used}ms</td>
                <td>{new Date(sub.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedSubmission && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-content submission-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>提交详情 #{selectedSubmission.id}</h2>
              <button className="modal-close" onClick={closeDetail}>&times;</button>
            </div>

            {detailLoading ? (
              <div className="loading"><div className="spinner"></div></div>
            ) : (
              <div className="submission-detail">
                <div className="detail-section">
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">题目：</span>
                      <span className="detail-value">{selectedSubmission.problem_title}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">语言：</span>
                      <span className="detail-value">{selectedSubmission.language === 'cpp' ? 'C++' : 'Python'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">状态：</span>
                      <span className={`status-badge status-${getStatusClass(selectedSubmission.status)}`}>
                        {selectedSubmission.display_status || getStatusInfo(selectedSubmission.status).label}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">分数：</span>
                      <span className={`score-badge score-${selectedSubmission.score >= 100 ? 'full' : selectedSubmission.score >= 60 ? 'pass' : 'fail'}`}>
                        {selectedSubmission.score}%
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">耗时：</span>
                      <span className="detail-value">{selectedSubmission.time_used}ms</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">内存：</span>
                      <span className="detail-value">{selectedSubmission.memory_used}MB</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">提交时间：</span>
                      <span className="detail-value">{new Date(selectedSubmission.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {selectedSubmission.error_message && (
                  <div className="detail-section">
                    <h3 className="detail-section-title">错误信息</h3>
                    <pre className="error-message">{selectedSubmission.error_message}</pre>
                  </div>
                )}

                {selectedSubmission.test_cases && selectedSubmission.test_cases.length > 0 && (
                  <div className="detail-section">
                    <h3 className="detail-section-title">测试点明细</h3>
                    <div className="test-cases-list">
                      {selectedSubmission.test_cases.map((tc, idx) => (
                        <div key={tc.id || idx} className="test-case-item">
                          <div className="test-case-header">
                            <span className="test-case-number">测试点 #{tc.test_case_number}</span>
                            <span className={`status-badge status-${getStatusClass(tc.status)}`}>
                              {tc.display_status || getStatusInfo(tc.status).label}
                            </span>
                          </div>
                          <div className="test-case-meta">
                            <span>耗时: {tc.time_used}ms</span>
                            <span>内存: {tc.memory_used}MB</span>
                          </div>
                          {tc.error_message && (
                            <pre className="test-case-error">{tc.error_message}</pre>
                          )}
                          {tc.actual_output && (
                            <div className="test-case-output">
                              <span className="output-label">实际输出：</span>
                              <pre className="output-content">{tc.actual_output}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedSubmission.code && (
                  <div className="detail-section">
                    <h3 className="detail-section-title">提交代码</h3>
                    <pre className="code-block">{selectedSubmission.code}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Submissions;
