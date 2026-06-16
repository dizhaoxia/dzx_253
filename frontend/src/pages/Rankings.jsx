import { useState, useEffect, useRef } from 'react';
import { rankingAPI } from '../api';
import { useSocket } from '../context/SocketContext';

const Rankings = () => {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [wsActive, setWsActive] = useState(false);
  const { isConnected } = useSocket();
  const pollingRef = useRef(null);

  const fetchRankings = async (showIndicator = false) => {
    if (showIndicator) setRefreshing(true);
    try {
      const response = await rankingAPI.getAll();
      setRankings(response.data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch rankings:', error);
    } finally {
      setLoading(false);
      if (showIndicator) {
        setTimeout(() => setRefreshing(false), 500);
      }
    }
  };

  useEffect(() => {
    fetchRankings();

    const handleRankingsUpdated = () => {
      fetchRankings(true);
    };

    window.addEventListener('rankings_updated', handleRankingsUpdated);

    const interval = setInterval(() => {
      if (!isConnected) {
        fetchRankings();
      }
    }, 10000);
    pollingRef.current = interval;

    return () => {
      window.removeEventListener('rankings_updated', handleRankingsUpdated);
      clearInterval(interval);
    };
  }, [isConnected]);

  useEffect(() => {
    setWsActive(isConnected);
  }, [isConnected]);

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

  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="rankings-header">
        <h1 className="page-title">排行榜</h1>
        <div className="rankings-status">
          <div className={`live-indicator ${wsActive ? 'live' : 'fallback'}`}>
            <span className="live-dot"></span>
            <span className="live-text">{wsActive ? '实时' : '轮询中'}</span>
          </div>
          {refreshing && <span className="refreshing-spinner"></span>}
          {lastUpdated && (
            <span className="last-updated">更新于 {formatTime(lastUpdated)}</span>
          )}
        </div>
      </div>
      
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
              <th>AC 提交数</th>
              <th>平均分数</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((user, index) => (
              <tr key={user.user_id}>
                <td className={getRankClass(index)}>{getRankIcon(index)}</td>
                <td>{user.username}</td>
                <td>{user.solved_count}</td>
                <td>{user.ac_submissions}</td>
                <td>{Number(user.avg_score).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Rankings;
