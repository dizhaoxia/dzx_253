import { useState, useEffect } from 'react';
import { rankingAPI } from '../api';

const Rankings = () => {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        const response = await rankingAPI.getAll();
        setRankings(response.data);
      } catch (error) {
        console.error('Failed to fetch rankings:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRankings();

    const interval = setInterval(fetchRankings, 10000);
    return () => clearInterval(interval);
  }, []);

  const getRankClass = (index) => {
    if (index === 0) return 'rank-1';
    if (index === 1) return 'rank-2';
    if (index === 2) return 'rank-3';
    return '';
  };

  const getRankIcon = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <h1 className="page-title">排行榜</h1>
      <p style={{ marginBottom: '1rem', color: '#666' }}>每 10 秒自动刷新</p>
      
      {rankings.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>暂无排行数据</p>
        </div>
      ) : (
        <table className="ranking-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>用户名</th>
              <th>通过题目数</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((user, index) => (
              <tr key={user.user_id}>
                <td className={getRankClass(index)}>{getRankIcon(index)}</td>
                <td>{user.username}</td>
                <td>{user.solved_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Rankings;
