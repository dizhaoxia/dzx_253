import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { roomAPI, problemAPI, submissionAPI } from '../api';

const JUDGE_STATUS_MAP = {
  AC: { code: 'AC', display: '通过', english: 'Accepted', className: 'accepted', icon: '✅', color: '#28a745' },
  WA: { code: 'WA', display: '答案错误', english: 'Wrong Answer', className: 'wrong-answer', icon: '❌', color: '#dc3545' },
  CE: { code: 'CE', display: '编译错误', english: 'Compile Error', className: 'compile-error', icon: '🔧', color: '#ffc107' },
  RE: { code: 'RE', display: '运行时错误', english: 'Runtime Error', className: 'runtime-error', icon: '💥', color: '#dc3545' },
  TLE: { code: 'TLE', display: '时间超限', english: 'Time Limit Exceeded', className: 'time-limit-exceeded', icon: '⏰', color: '#fd7e14' },
  MLE: { code: 'MLE', display: '内存超限', english: 'Memory Limit Exceeded', className: 'memory-limit-exceeded', icon: '💾', color: '#fd7e14' },
  PE: { code: 'PE', display: '格式错误', english: 'Presentation Error', className: 'presentation-error', icon: '📝', color: '#17a2b8' },
  Pending: { code: 'Pending', display: '等待中', english: 'Pending', className: 'pending', icon: '⏳', color: '#6c757d' },
  Judging: { code: 'Judging', display: '判题中', english: 'Judging', className: 'judging', icon: '🔄', color: '#007bff' },
  'Judge Error': { code: 'Judge Error', display: '判题错误', english: 'Judge Error', className: 'judge-error', icon: '⚠️', color: '#dc3545' }
};

const statusToClass = (status) => JUDGE_STATUS_MAP[status]?.className || '';
const statusToIcon = (status) => JUDGE_STATUS_MAP[status]?.icon || '❓';
const statusToDisplay = (status) => JUDGE_STATUS_MAP[status]?.display || status;
const statusToColor = (status) => JUDGE_STATUS_MAP[status]?.color || '#6c757d';

const getStatusBadgeClass = (status) => {
  const map = {
    AC: 'tc-ac', WA: 'tc-wa', CE: 'tc-ce', RE: 'tc-re',
    TLE: 'tc-tle', MLE: 'tc-mle', PE: 'tc-pe',
    Pending: 'tc-pending', Judging: 'tc-judging'
  };
  return map[status] || 'tc-pending';
};

const Rooms = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentRoom, roomMembers, roomMessages, createRoom, joinRoom, leaveRoom, sendMessage, isConnected } = useSocket();
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState('');
  const [myRooms, setMyRooms] = useState([]);
  const [problems, setProblems] = useState([]);
  const [problemsLoading, setProblemsLoading] = useState(false);
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [problemLoading, setProblemLoading] = useState(false);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('cpp');
  const [submitting, setSubmitting] = useState(false);
  const [pollingId, setPollingId] = useState(null);
  const [lastSubmission, setLastSubmission] = useState(null);
  const [judgeResult, setJudgeResult] = useState(null);
  const [wsReceived, setWsReceived] = useState(false);
  const messagesEndRef = React.useRef(null);
  const pollingRef = useRef(null);
  const wsTimeoutRef = useRef(null);

  useEffect(() => {
    if (user) {
      loadMyRooms();
      loadProblems();
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomMessages]);

  useEffect(() => {
    const handler = (e) => {
      if (!pollingId || e.detail.submission_id !== pollingId) return;
      setWsReceived(true);
      if (wsTimeoutRef.current) clearTimeout(wsTimeoutRef.current);

      if (e.detail.status !== 'Pending' && e.detail.status !== 'Judging') {
        fetchSubmissionDetail(pollingId);
      } else {
        setLastSubmission(prev => ({ ...prev, ...e.detail }));
      }
    };
    window.addEventListener('submission_updated', handler);
    return () => window.removeEventListener('submission_updated', handler);
  }, [pollingId]);

  useEffect(() => {
    if (!pollingId) return;

    if (isConnected && !wsReceived) {
      wsTimeoutRef.current = setTimeout(() => {}, 3000);
    }

    pollingRef.current = setInterval(async () => {
      try {
        const res = await submissionAPI.getById(pollingId);
        const sub = res.data;
        setLastSubmission(sub);
        if (sub.status !== 'Pending' && sub.status !== 'Judging') {
          setJudgeResult(sub);
          cleanupPolling();
        }
      } catch (err) {
        console.error('Poll error:', err);
        cleanupPolling();
      }
    }, 1500);

    return () => cleanupPolling();
  }, [pollingId, isConnected, wsReceived]);

  const cleanupPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (wsTimeoutRef.current) clearTimeout(wsTimeoutRef.current);
    pollingRef.current = null;
    setPollingId(null);
  };

  const fetchSubmissionDetail = async (id) => {
    try {
      const res = await submissionAPI.getById(id);
      setLastSubmission(res.data);
      setJudgeResult(res.data);
      cleanupPolling();
    } catch (err) {
      console.error('Fetch submission error:', err);
    }
  };

  const loadMyRooms = async () => {
    try {
      const res = await roomAPI.getAll();
      setMyRooms(res.data);
    } catch (error) {
      console.error('Load rooms error:', error);
    }
  };

  const loadProblems = async () => {
    try {
      setProblemsLoading(true);
      const res = await problemAPI.getAll();
      setProblems(res.data.problems || res.data || []);
    } catch (error) {
      console.error('Load problems error:', error);
    } finally {
      setProblemsLoading(false);
    }
  };

  const loadProblemDetail = async (problemId) => {
    try {
      setProblemLoading(true);
      setSelectedProblem(null);
      setJudgeResult(null);
      setLastSubmission(null);
      cleanupPolling();
      const res = await problemAPI.getById(problemId);
      setSelectedProblem(res.data);
      if (language === 'cpp') {
        setCode('#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n');
      } else {
        setCode('a, b = map(int, input().split())\nprint(a + b)\n');
      }
    } catch (error) {
      console.error('Load problem detail error:', error);
    } finally {
      setProblemLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedProblem) return;
    if (language === 'cpp') {
      setCode('#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n');
    } else {
      setCode('a, b = map(int, input().split())\nprint(a + b)\n');
    }
  }, [language, selectedProblem?.id]);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!roomName.trim()) return;
    createRoom(roomName.trim());
    setRoomName('');
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!joinCode.trim() || joinCode.length !== 6) return;
    joinRoom(joinCode.trim());
    setJoinCode('');
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMessage(message.trim());
    setMessage('');
  };

  const handleQuickJoin = (roomCode) => {
    joinRoom(roomCode);
  };

  const handleSubmit = async () => {
    if (!code.trim()) {
      alert('请输入代码');
      return;
    }
    if (!selectedProblem) {
      alert('请先选择一道题目');
      return;
    }

    setSubmitting(true);
    setJudgeResult(null);
    setWsReceived(false);
    try {
      const res = await submissionAPI.submit({
        problem_id: selectedProblem.id,
        code,
        language
      });
      setPollingId(res.data.id);
      setLastSubmission({ id: res.data.id, status: 'Pending' });
    } catch (error) {
      alert(error.response?.data?.error || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const getDifficultyColor = (difficulty) => {
    const colors = { Easy: 'difficulty-easy', Medium: 'difficulty-medium', Hard: 'difficulty-hard' };
    return colors[difficulty] || 'difficulty-easy';
  };

  if (!currentRoom) {
    return (
      <div className="rooms-container">
        <h1 className="page-title">比赛房间</h1>
        <div className="connection-status" style={{ marginBottom: '20px' }}>
          <span className={`dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span>{isConnected ? 'WebSocket 已连接' : 'WebSocket 连接中...'}</span>
        </div>
        <div className="room-actions">
          <div className="card">
            <h3>创建房间</h3>
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label>房间名称</label>
                <input
                  type="text" value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder={`${user?.username}'s Room`} maxLength={50}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={!isConnected}>创建房间</button>
            </form>
          </div>
          <div className="card">
            <h3>加入房间</h3>
            <form onSubmit={handleJoinRoom}>
              <div className="form-group">
                <label>房间号 (6位数字)</label>
                <input
                  type="text" value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="请输入6位房间号"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={!isConnected || joinCode.length !== 6}>加入房间</button>
            </form>
          </div>
        </div>
        {myRooms.length > 0 && (
          <div className="card" style={{ marginTop: '30px' }}>
            <h3>我的房间</h3>
            <div className="room-list">
              {myRooms.map((room) => (
                <div key={room.id} className="room-item">
                  <div className="room-info">
                    <div className="room-name">{room.name}</div>
                    <div className="room-meta">
                      <span className="room-code">房间号: {room.room_code}</span>
                      <span>成员: {room.member_count}</span>
                    </div>
                  </div>
                  <button className="btn btn-secondary" onClick={() => handleQuickJoin(room.room_code)} disabled={!isConnected}>进入</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="room-container room-3col">
      <div className="room-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: '5px' }}>{currentRoom.name}</h1>
          <div className="room-code-display">
            房间号: <span className="code-highlight">{currentRoom.roomCode}</span>
            <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(currentRoom.roomCode)} style={{ marginLeft: '10px' }}>复制</button>
          </div>
        </div>
        <div className="room-header-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/problems')}>全部题目</button>
          <button className="btn btn-danger" onClick={() => { setSelectedProblem(null); leaveRoom(); }}>离开房间</button>
        </div>
      </div>

      <div className="room-3col-content">
        <div className="sidebar-panel">
          <div className="members-section">
            <h3>在线成员 ({roomMembers.length})</h3>
            <div className="member-list">
              {roomMembers.map((member) => (
                <div key={member.id} className="member-item">
                  <div className="member-avatar">{member.username.charAt(0).toUpperCase()}</div>
                  <div className="member-info">
                    <div className="member-name">{member.username}</div>
                    {member.role === 'admin' && <span className="badge badge-admin">管理员</span>}
                  </div>
                  {member.id === currentRoom.creatorId && <span className="badge badge-creator">房主</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="problems-section">
            <h3>题目列表</h3>
            <div className="room-problem-list">
              {problemsLoading ? (
                <div className="loading-text">加载中...</div>
              ) : problems.length === 0 ? (
                <div className="empty-text">暂无题目</div>
              ) : (
                problems.map((problem) => (
                  <div
                    key={problem.id}
                    className={`room-problem-item ${selectedProblem?.id === problem.id ? 'selected' : ''}`}
                    onClick={() => loadProblemDetail(problem.id)}
                  >
                    <span className="problem-id">#{problem.id}</span>
                    <span className="problem-title-text">{problem.title}</span>
                    <span className={`problem-difficulty ${getDifficultyColor(problem.difficulty)}`}>{problem.difficulty}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="editor-panel">
          {!selectedProblem ? (
            <div className="empty-problem">
              <div className="empty-icon">📝</div>
              <h3>请选择一道题目</h3>
              <p>从左侧题目列表中选择题目开始答题</p>
            </div>
          ) : problemLoading ? (
            <div className="loading"><div className="spinner"></div></div>
          ) : (
            <div className="editor-content">
              <div className="problem-detail-section">
                <div className="card">
                  <h2 style={{ marginBottom: '1rem', color: '#667eea', fontSize: '1.2rem' }}>
                    #{selectedProblem.id} {selectedProblem.title}
                  </h2>
                  <h3 style={{ margin: '1rem 0 0.5rem', color: '#333', fontSize: '1rem' }}>题目描述</h3>
                  <p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem', fontSize: '0.9rem' }}>{selectedProblem.description}</p>
                  <h3 style={{ margin: '1rem 0 0.5rem', color: '#333', fontSize: '1rem' }}>输入格式</h3>
                  <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{selectedProblem.input_format}</p>
                  <h3 style={{ margin: '1rem 0 0.5rem', color: '#333', fontSize: '1rem' }}>输出格式</h3>
                  <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{selectedProblem.output_format}</p>
                  <div className="problem-meta" style={{ marginTop: '1rem' }}>
                    <span>⏱️ {selectedProblem.time_limit}ms</span>
                    <span>💾 {selectedProblem.memory_limit}MB</span>
                    {selectedProblem.test_case_count !== undefined && <span>🧪 {selectedProblem.test_case_count}个测试点</span>}
                  </div>
                </div>
                <div className="card">
                  <h3 style={{ marginBottom: '0.75rem', color: '#667eea', fontSize: '1rem' }}>样例</h3>
                  <div className="sample-box">
                    <h4>样例输入</h4>
                    <pre style={{ fontSize: '0.85rem' }}>{selectedProblem.sample_input}</pre>
                  </div>
                  <div className="sample-box">
                    <h4>样例输出</h4>
                    <pre style={{ fontSize: '0.85rem' }}>{selectedProblem.sample_output}</pre>
                  </div>
                </div>
              </div>

              <div className="code-section">
                <div className="card">
                  <h2 style={{ marginBottom: '0.75rem', color: '#667eea', fontSize: '1.1rem' }}>提交代码</h2>
                  <div className="language-select">
                    <label>
                      <input type="radio" name="room-language" value="cpp" checked={language === 'cpp'} onChange={(e) => setLanguage(e.target.value)} />
                      C++
                    </label>
                    <label>
                      <input type="radio" name="room-language" value="python" checked={language === 'python'} onChange={(e) => setLanguage(e.target.value)} />
                      Python
                    </label>
                  </div>
                  <textarea
                    className="code-editor" value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="在此输入代码..."
                    style={{ fontSize: '0.85rem', minHeight: '200px' }}
                  />
                  <div className="submission-actions">
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || !!pollingId}>
                      {submitting ? '提交中...' : pollingId ? '判题中...' : '提交代码'}
                    </button>
                    {lastSubmission && !pollingId && !judgeResult && (
                      <span className={`status-badge status-${statusToClass(lastSubmission.status)}`}>
                        {statusToDisplay(lastSubmission.status)}
                      </span>
                    )}
                  </div>

                  {pollingId && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div className="spinner" style={{ width: '18px', height: '18px' }}></div>
                      <span style={{ color: '#666', fontSize: '0.9rem' }}>判题中...</span>
                      {isConnected && <span style={{ fontSize: '0.8rem', color: '#28a745' }}>⚡ WebSocket</span>}
                    </div>
                  )}

                  {judgeResult && (
                    <div className={`judge-result judge-result-${statusToClass(judgeResult.status)}`} style={{
                      marginTop: '0.75rem', padding: '1rem', borderRadius: '10px',
                      background: judgeResult.status === 'AC' ? '#d4edda' : '#f8d7da',
                      border: `2px solid ${statusToColor(judgeResult.status)}`, textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '1.5rem' }}>{statusToIcon(judgeResult.status)}</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: statusToColor(judgeResult.status) }}>
                        {statusToDisplay(judgeResult.status)}
                        <span style={{ fontSize: '0.8rem', marginLeft: '0.5rem', opacity: 0.7 }}>
                          ({JUDGE_STATUS_MAP[judgeResult.status]?.english})
                        </span>
                      </div>
                      {judgeResult.score !== undefined && judgeResult.score !== null && (
                        <div style={{ marginTop: '0.25rem', fontSize: '1rem', fontWeight: 'bold', color: statusToColor(judgeResult.status) }}>
                          得分: {judgeResult.score}%
                        </div>
                      )}
                      {judgeResult.time_used > 0 && (
                        <div style={{ marginTop: '0.25rem', color: '#666', fontSize: '0.85rem' }}>
                          {judgeResult.time_used}ms {judgeResult.memory_used > 0 && `| ${judgeResult.memory_used}MB`}
                        </div>
                      )}
                    </div>
                  )}

                  {judgeResult && judgeResult.status === 'CE' && judgeResult.error_message && (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', color: '#856404', fontSize: '0.9rem' }}>🔧 编译错误</h4>
                      <pre style={{ margin: 0, padding: '0.5rem', background: '#fff', borderRadius: '4px', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '200px', overflowY: 'auto' }}>
                        {judgeResult.error_message}
                      </pre>
                    </div>
                  )}

                  {judgeResult && judgeResult.test_cases && judgeResult.test_cases.length > 0 && (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '8px', background: '#fff', border: '1px solid #e1e5e9' }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', color: '#333', fontSize: '0.9rem' }}>📊 测试点详情</h4>
                      <div className="test-case-grid">
                        {judgeResult.test_cases.map((tc, idx) => (
                          <div key={idx} className={`test-case-item ${getStatusBadgeClass(tc.status)}`}>
                            <span className="tc-num">#{tc.test_case_number || idx + 1}</span>
                            <span className="tc-status">{tc.status}</span>
                            {tc.time_used > 0 && <span className="tc-time">{tc.time_used}ms</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="chat-panel room-chat">
          <div className="chat-header">聊天 & 动态</div>
          <div className="messages-area">
            {roomMessages.length === 0 && (
              <div className="no-messages">暂无消息，发送第一条消息吧！</div>
            )}
            {roomMessages.map((msg, index) => (
              msg.type === 'solved' ? (
                <div key={msg.id || index} className="message system-message solved-message">
                  <span className="solved-icon">🎉</span>
                  <span className="message-content">{msg.content}</span>
                </div>
              ) : msg.type === 'system' ? (
                <div key={msg.id || index} className="message system-message">
                  <span className="message-content">{msg.content}</span>
                </div>
              ) : (
                <div key={msg.id || index} className={`message ${msg.username === user?.username ? 'own-message' : 'other-message'}`}>
                  <div className="message-sender">{msg.username}</div>
                  <div className="message-bubble">{msg.content}</div>
                  <div className="message-time">{new Date(msg.created_at).toLocaleTimeString()}</div>
                </div>
              )
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form className="message-input-area" onSubmit={handleSendMessage}>
            <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="输入消息..." className="message-input" />
            <button type="submit" className="btn btn-primary" disabled={!message.trim()}>发送</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Rooms;
