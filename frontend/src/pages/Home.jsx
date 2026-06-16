import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { problemAPI, rankingAPI } from '../api';
import { useSocket } from '../context/SocketContext';

const Home = () => {
  const [stats, setStats] = useState({ problems: 0, users: 0 });
  const [loading, setLoading] = useState(true);
  const { globalSolvedFeed } = useSocket();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [problemsRes, rankingsRes] = await Promise.all([
          problemAPI.getAll(),
          rankingAPI.getAll()
        ]);
        setStats({
          problems: problemsRes.data.length,
          users: rankingsRes.data.length
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="home-hero">
        <h1>编程竞赛平台</h1>
        <p>挑战算法题目，提升编程能力，与其他开发者一较高下</p>
      </div>
      
      <div className="home-stats">
        <div className="stat-card">
          <div className="stat-number">{stats.problems}</div>
          <div className="stat-label">题目总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.users}</div>
          <div className="stat-label">注册用户</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>实时解题动态</h2>
        {globalSolvedFeed.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '1rem' }}>暂无解题动态</p>
        ) : (
          <div className="solved-feed">
            {globalSolvedFeed.map((item, index) => (
              <div key={`${item.user_id}-${item.problem_id}-${item.timestamp}-${index}`} className="solved-feed-item">
                <div className="solved-feed-icon">✅</div>
                <div className="solved-feed-content">
                  <span className="solved-feed-username">{item.username}</span>
                  <span className="solved-feed-text"> 解决了 </span>
                  <span className="solved-feed-problem">#{item.problem_id} {item.problem_title}</span>
                </div>
                <div className="solved-feed-time">{formatTime(item.timestamp)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '2rem', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>开始你的编程之旅</h2>
        <p style={{ marginBottom: '1.5rem', color: '#666' }}>
          浏览题目列表，选择一道题目开始挑战，支持 C++ 和 Python 两种编程语言
        </p>
        <Link to="/problems">
          <button className="btn btn-primary">浏览题目</button>
        </Link>
      </div>
    </div>
  );
};

export default Home;
