import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout, isAdmin } = useAuth();

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">OJ Platform</Link>
        <div className="nav-links">
          <Link to="/">首页</Link>
          <Link to="/problems">题目列表</Link>
          <Link to="/rankings">排行榜</Link>
          {user && <Link to="/submissions">提交记录</Link>}
          {isAdmin() && <Link to="/admin">管理后台</Link>}
          {user ? (
            <div className="user-info">
              <span>
                {user.username}
                {isAdmin() && <span className="admin-badge">管理员</span>}
              </span>
              <button onClick={logout}>退出</button>
            </div>
          ) : (
            <Link to="/auth">登录/注册</Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
