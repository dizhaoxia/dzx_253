import { useState, useEffect } from 'react';
import { submissionAPI } from '../api';
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

const Submissions = () => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
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
    fetchSubmissions();

    const interval = setInterval(fetchSubmissions, 5000);
    return () => clearInterval(interval);
  }, [user.id]);

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
              <th>耗时</th>
              <th>提交时间</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((sub) => (
              <tr key={sub.id}>
                <td>#{sub.id}</td>
                <td>{sub.problem_title}</td>
                <td>{sub.language === 'cpp' ? 'C++' : 'Python'}</td>
                <td>
                  <span className={`status-badge status-${statusToClass(sub.status)}`}>
                    {sub.status}
                  </span>
                </td>
                <td>{sub.time_used}ms</td>
                <td>{new Date(sub.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Submissions;
