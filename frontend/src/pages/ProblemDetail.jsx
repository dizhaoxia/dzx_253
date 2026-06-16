import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { problemAPI, submissionAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const JUDGE_STATUS_MAP = {
  AC: {
    code: 'AC',
    display: '通过',
    english: 'Accepted',
    className: 'accepted',
    icon: '✅',
    color: '#28a745'
  },
  WA: {
    code: 'WA',
    display: '答案错误',
    english: 'Wrong Answer',
    className: 'wrong-answer',
    icon: '❌',
    color: '#dc3545'
  },
  CE: {
    code: 'CE',
    display: '编译错误',
    english: 'Compile Error',
    className: 'compile-error',
    icon: '🔧',
    color: '#ffc107'
  },
  RE: {
    code: 'RE',
    display: '运行时错误',
    english: 'Runtime Error',
    className: 'runtime-error',
    icon: '💥',
    color: '#dc3545'
  },
  TLE: {
    code: 'TLE',
    display: '时间超限',
    english: 'Time Limit Exceeded',
    className: 'time-limit-exceeded',
    icon: '⏰',
    color: '#fd7e14'
  },
  MLE: {
    code: 'MLE',
    display: '内存超限',
    english: 'Memory Limit Exceeded',
    className: 'memory-limit-exceeded',
    icon: '💾',
    color: '#fd7e14'
  },
  PE: {
    code: 'PE',
    display: '格式错误',
    english: 'Presentation Error',
    className: 'presentation-error',
    icon: '📝',
    color: '#17a2b8'
  },
  Pending: {
    code: 'Pending',
    display: '等待中',
    english: 'Pending',
    className: 'pending',
    icon: '⏳',
    color: '#6c757d'
  },
  Judging: {
    code: 'Judging',
    display: '判题中',
    english: 'Judging',
    className: 'judging',
    icon: '🔄',
    color: '#007bff'
  },
  'Judge Error': {
    code: 'Judge Error',
    display: '判题错误',
    english: 'Judge Error',
    className: 'judge-error',
    icon: '⚠️',
    color: '#dc3545'
  }
};

const statusToClass = (status) => {
  return JUDGE_STATUS_MAP[status]?.className || '';
};

const statusToIcon = (status) => {
  return JUDGE_STATUS_MAP[status]?.icon || '❓';
};

const statusToDisplay = (status) => {
  return JUDGE_STATUS_MAP[status]?.display || status;
};

const statusToColor = (status) => {
  return JUDGE_STATUS_MAP[status]?.color || '#6c757d';
};

const ProblemDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isConnected } = useSocket();
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('cpp');
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmission, setLastSubmission] = useState(null);
  const [pollingId, setPollingId] = useState(null);
  const [judgeResult, setJudgeResult] = useState(null);
  const [wsReceived, setWsReceived] = useState(false);
  const pollingRef = useRef(null);
  const wsTimeoutRef = useRef(null);

  useEffect(() => {
    const fetchProblem = async () => {
      try {
        const response = await problemAPI.getById(id);
        setProblem(response.data);
        if (language === 'cpp') {
          setCode('#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n');
        } else {
          setCode('a, b = map(int, input().split())\nprint(a + b)\n');
        }
      } catch (error) {
        console.error('Failed to fetch problem:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProblem();
  }, [id]);

  useEffect(() => {
    if (language === 'cpp') {
      setCode('#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n');
    } else {
      setCode('a, b = map(int, input().split())\nprint(a + b)\n');
    }
  }, [language]);

  const handleSubmissionUpdate = async (data) => {
    if (!pollingId || data.submission_id !== pollingId) return;

    setWsReceived(true);
    if (wsTimeoutRef.current) {
      clearTimeout(wsTimeoutRef.current);
      wsTimeoutRef.current = null;
    }

    if (data.status !== 'Pending' && data.status !== 'Judging') {
      try {
        const response = await submissionAPI.getById(pollingId);
        const sub = response.data;
        setLastSubmission(sub);
        setJudgeResult(sub);
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        setPollingId(null);
      } catch (error) {
        console.error('Fetch submission detail error:', error);
      }
    } else {
      setLastSubmission(prev => ({ ...prev, ...data }));
    }
  };

  useEffect(() => {
    window.addEventListener('submission_updated', (e) => {
      handleSubmissionUpdate(e.detail);
    });
    return () => {
      window.removeEventListener('submission_updated', (e) => {
        handleSubmissionUpdate(e.detail);
      });
    };
  }, [pollingId]);

  useEffect(() => {
    if (pollingId) {
      if (isConnected && !wsReceived) {
        wsTimeoutRef.current = setTimeout(() => {
          if (!wsReceived) {
            console.log('WebSocket timeout, falling back to polling');
          }
        }, 3000);
      }

      const poll = async () => {
        try {
          const response = await submissionAPI.getById(pollingId);
          const sub = response.data;
          setLastSubmission(sub);
          if (sub.status !== 'Pending' && sub.status !== 'Judging') {
            setJudgeResult(sub);
            clearInterval(pollingRef.current);
            pollingRef.current = null;
            setPollingId(null);
            if (wsTimeoutRef.current) {
              clearTimeout(wsTimeoutRef.current);
              wsTimeoutRef.current = null;
            }
          }
        } catch (error) {
          console.error('Polling error:', error);
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setPollingId(null);
          if (wsTimeoutRef.current) {
            clearTimeout(wsTimeoutRef.current);
            wsTimeoutRef.current = null;
          }
        }
      };
      pollingRef.current = setInterval(poll, 1500);
      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        if (wsTimeoutRef.current) {
          clearTimeout(wsTimeoutRef.current);
          wsTimeoutRef.current = null;
        }
      };
    }
  }, [pollingId, isConnected, wsReceived]);

  const handleSubmit = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    if (!code.trim()) {
      alert('请输入代码');
      return;
    }

    setSubmitting(true);
    setJudgeResult(null);
    setWsReceived(false);
    try {
      const response = await submissionAPI.submit({
        problem_id: problem.id,
        code,
        language
      });
      setPollingId(response.data.id);
      setLastSubmission({ id: response.data.id, status: 'Pending' });
    } catch (error) {
      alert(error.response?.data?.error || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!problem) {
    return <div className="card">题目不存在</div>;
  }

  return (
    <div>
      <h1 className="page-title">#{problem.id} {problem.title}</h1>
      
      <div className="problem-detail">
        <div>
          <div className="card">
            <h2 style={{ marginBottom: '1rem', color: '#667eea' }}>题目描述</h2>
            <p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{problem.description}</p>
            
            <h3 style={{ margin: '1.5rem 0 0.5rem', color: '#333' }}>输入格式</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{problem.input_format}</p>
            
            <h3 style={{ margin: '1.5rem 0 0.5rem', color: '#333' }}>输出格式</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{problem.output_format}</p>
            
            <div className="problem-meta" style={{ marginTop: '1.5rem' }}>
              <span>⏱️ 时间限制: {problem.time_limit}ms</span>
              <span>💾 内存限制: {problem.memory_limit}MB</span>
              {problem.test_case_count !== undefined && problem.test_case_count !== null && (
                <span>🧪 测试点总数: {problem.test_case_count}</span>
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem', color: '#667eea' }}>样例</h3>
            <div className="sample-box">
              <h4>样例输入</h4>
              <pre>{problem.sample_input}</pre>
            </div>
            <div className="sample-box">
              <h4>样例输出</h4>
              <pre>{problem.sample_output}</pre>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <h2 style={{ marginBottom: '1rem', color: '#667eea' }}>提交代码</h2>
            
            <div className="language-select">
              <label>
                <input
                  type="radio"
                  name="language"
                  value="cpp"
                  checked={language === 'cpp'}
                  onChange={(e) => setLanguage(e.target.value)}
                />
                C++
              </label>
              <label>
                <input
                  type="radio"
                  name="language"
                  value="python"
                  checked={language === 'python'}
                  onChange={(e) => setLanguage(e.target.value)}
                />
                Python
              </label>
            </div>

            <textarea
              className="code-editor"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="在此输入代码..."
            />

            <div className="submission-actions">
              <button 
                className="btn btn-primary" 
                onClick={handleSubmit}
                disabled={submitting || !!pollingId}
              >
                {submitting ? '提交中...' : pollingId ? '判题中...' : '提交代码'}
              </button>
              
              {lastSubmission && !pollingId && !judgeResult && (
                <span className={`status-badge status-${statusToClass(lastSubmission.status)}`}>
                  {statusToDisplay(lastSubmission.status)}
                  {lastSubmission.time_used > 0 && ` (${lastSubmission.time_used}ms)`}
                </span>
              )}
            </div>

            {pollingId && (
              <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
                <span style={{ color: '#666' }}>正在判题中，请稍候...</span>
                {isConnected && (
                  <span style={{ fontSize: '0.85rem', color: '#28a745' }}>⚡ WebSocket 已连接</span>
                )}
              </div>
            )}

            {judgeResult && (
              <div className={`judge-result judge-result-${statusToClass(judgeResult.status)}`} style={{
                marginTop: '1rem',
                padding: '1.25rem',
                borderRadius: '10px',
                background: judgeResult.status === 'AC' ? '#d4edda' : '#f8d7da',
                border: `2px solid ${statusToColor(judgeResult.status)}`,
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                  {statusToIcon(judgeResult.status)}
                </div>
                <div style={{ 
                  fontSize: '1.5rem', 
                  fontWeight: 'bold',
                  color: statusToColor(judgeResult.status)
                }}>
                  {statusToDisplay(judgeResult.status)}
                  <span style={{ fontSize: '0.9rem', marginLeft: '0.5rem', opacity: 0.7 }}>
                    ({JUDGE_STATUS_MAP[judgeResult.status]?.english || judgeResult.status})
                  </span>
                </div>
                {judgeResult.score !== undefined && judgeResult.score !== null && (
                  <div style={{ 
                    marginTop: '0.5rem', 
                    fontSize: '1.25rem', 
                    fontWeight: 'bold',
                    color: statusToColor(judgeResult.status)
                  }}>
                    得分: {judgeResult.score}%
                  </div>
                )}
                {judgeResult.time_used > 0 && (
                  <div style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
                    耗时: {judgeResult.time_used}ms
                    {judgeResult.memory_used > 0 && ` | 内存: ${judgeResult.memory_used}MB`}
                  </div>
                )}
              </div>
            )}

            {judgeResult && judgeResult.status === 'CE' && judgeResult.error_message && (
              <div className="card" style={{
                marginTop: '1rem',
                padding: '1rem',
                background: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '8px'
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: '#856404' }}>🔧 编译错误信息</h4>
                <pre style={{
                  margin: 0,
                  padding: '0.75rem',
                  background: '#fff',
                  borderRadius: '4px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  fontSize: '0.85rem',
                  color: '#333',
                  maxHeight: '300px',
                  overflowY: 'auto'
                }}>{judgeResult.error_message}</pre>
              </div>
            )}

            {judgeResult && judgeResult.test_cases && judgeResult.test_cases.length > 0 && (
              <div className="card" style={{
                marginTop: '1rem',
                padding: '1rem',
                borderRadius: '8px'
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: '#333' }}>📊 测试点详情</h4>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
                  gap: '0.5rem' 
                }}>
                  {judgeResult.test_cases.map((tc, index) => (
                    <div 
                      key={tc.id || index} 
                      className={`test-case-item test-case-${statusToClass(tc.status)}`}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: `1px solid ${statusToColor(tc.status)}40`,
                        background: `${statusToColor(tc.status)}10`,
                        fontSize: '0.85rem'
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.25rem',
                        fontWeight: 'bold',
                        color: statusToColor(tc.status)
                      }}>
                        <span>{statusToIcon(tc.status)}</span>
                        <span>#{tc.test_case_number || index + 1}</span>
                        <span>{tc.status}</span>
                      </div>
                      {tc.time_used !== undefined && tc.time_used !== null && (
                        <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                          ⏱️ {tc.time_used}ms
                        </div>
                      )}
                      {tc.memory_used !== undefined && tc.memory_used !== null && tc.memory_used > 0 && (
                        <div style={{ color: '#666', fontSize: '0.75rem' }}>
                          💾 {tc.memory_used}MB
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProblemDetail;
