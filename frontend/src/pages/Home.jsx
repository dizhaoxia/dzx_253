import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { problemAPI, rankingAPI } from '../api';

const Home = () => {
  const [stats, setStats] = useState({ problems: 0, users: 0 });
  const [loading, setLoading] = useState(true);

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
