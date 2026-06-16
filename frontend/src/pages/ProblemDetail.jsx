import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { problemAPI, submissionAPI } from '../api';
import { useAuth } from '../context/AuthContext';

const statusToClass = (status) => {
  const map = {
    'Accepted': 'accepted',
    'Wrong Answer': 'wrong-answer',
    'Pending': 'pending',
    'Judging': 'judging',
    'Runtime Error': 'runtime-error',
    'Judge Error': 'judge-error',
    'Time Limit Exceeded': 'time-limit-exceeded'
  };
  return map[status] || '';
};

const statusToIcon = (status) => {
  const map = {
    'Accepted': '✅',
    'Wrong Answer': '❌',
    'Pending': '⏳',
    'Judging': '🔄',
    'Runtime Error': '💥',
    'Judge Error': '⚠️',
    'Time Limit Exceeded': '⏰'
  };
  return map[status] || '❓';
};

const ProblemDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('cpp');
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmission, setLastSubmission] = useState(null);
  const [pollingId, setPollingId] = useState(null);
  const [judgeResult, setJudgeResult] = useState(null);
  const pollingRef = useRef(null);

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

  useEffect(() => {
    if (pollingId) {
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
          }
        } catch (error) {
          console.error('Polling error:', error);
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setPollingId(null);
        }
      };
      pollingRef.current = setInterval(poll, 1500);
      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }
  }, [pollingId]);

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
                  {lastSubmission.status}
                  {lastSubmission.time_used > 0 && ` (${lastSubmission.time_used}ms)`}
                </span>
              )}
            </div>

            {pollingId && (
              <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
                <span style={{ color: '#666' }}>正在判题中，请稍候...</span>
              </div>
            )}

            {judgeResult && (
              <div className={`judge-result judge-result-${statusToClass(judgeResult.status)}`} style={{
                marginTop: '1rem',
                padding: '1.25rem',
                borderRadius: '10px',
                background: judgeResult.status === 'Accepted' ? '#d4edda' : '#f8d7da',
                border: judgeResult.status === 'Accepted' ? '2px solid #28a745' : '2px solid #dc3545',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                  {statusToIcon(judgeResult.status)}
                </div>
                <div style={{ 
                  fontSize: '1.5rem', 
                  fontWeight: 'bold',
                  color: judgeResult.status === 'Accepted' ? '#155724' : '#721c24'
                }}>
                  {judgeResult.status}
                </div>
                {judgeResult.time_used > 0 && (
                  <div style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
                    耗时: {judgeResult.time_used}ms
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProblemDetail;
