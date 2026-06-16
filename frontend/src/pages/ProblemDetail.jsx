import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { problemAPI, submissionAPI } from '../api';
import { useAuth } from '../context/AuthContext';

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
      const interval = setInterval(async () => {
        try {
          const response = await submissionAPI.getById(pollingId);
          setLastSubmission(response.data);
          if (response.data.status !== 'Pending' && response.data.status !== 'Judging') {
            clearInterval(interval);
            setPollingId(null);
          }
        } catch (error) {
          console.error('Polling error:', error);
          clearInterval(interval);
          setPollingId(null);
        }
      }, 1000);
      return () => clearInterval(interval);
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
                disabled={submitting}
              >
                {submitting ? '提交中...' : '提交代码'}
              </button>
              
              {lastSubmission && (
                <span className={`status-badge status-${lastSubmission.status}`}>
                  {lastSubmission.status}
                  {lastSubmission.time_used > 0 && ` (${lastSubmission.time_used}ms)`}
                </span>
              )}
            </div>

            {lastSubmission && (lastSubmission.status === 'Pending' || lastSubmission.status === 'Judging') && (
              <p style={{ marginTop: '1rem', color: '#666' }}>
                <span className="spinner" style={{ width: '20px', height: '20px', marginRight: '0.5rem' }}></span>
                正在判题中，请稍候...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProblemDetail;
