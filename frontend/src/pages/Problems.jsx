import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { problemAPI } from '../api';

const Problems = () => {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    fetchProblems();
  }, []);

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <h1 className="page-title">题目列表</h1>
      
      {problems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>暂无题目</p>
        </div>
      ) : (
        <div className="problem-list">
          {problems.map((problem) => (
            <div key={problem.id} className="problem-item">
              <Link to={`/problems/${problem.id}`}>
                <h3>#{problem.id} {problem.title}</h3>
              </Link>
              <p style={{ color: '#666', marginTop: '0.5rem' }}>
                {problem.description.substring(0, 100)}...
              </p>
              <div className="problem-meta">
                <span>⏱️ {problem.time_limit}ms</span>
                <span>💾 {problem.memory_limit}MB</span>
                <span>🧪 {problem.test_case_count || 0} 测试点</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Problems;
