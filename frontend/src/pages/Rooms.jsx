import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { roomAPI } from '../api';

const Rooms = () => {
  const { user } = useAuth();
  const { currentRoom, roomMembers, roomMessages, createRoom, joinRoom, leaveRoom, sendMessage, isConnected } = useSocket();
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState('');
  const [myRooms, setMyRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = React.useRef(null);

  useEffect(() => {
    if (user) {
      loadMyRooms();
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomMessages]);

  const loadMyRooms = async () => {
    try {
      const res = await roomAPI.getAll();
      setMyRooms(res.data);
    } catch (error) {
      console.error('Load rooms error:', error);
    }
  };

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

  const getStatusColor = (status) => {
    const colors = {
      AC: 'status-ac',
      WA: 'status-wa',
      TLE: 'status-tle',
      MLE: 'status-mle',
      CE: 'status-ce',
      RE: 'status-re',
      PE: 'status-pe'
    };
    return colors[status] || '';
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
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder={`${user?.username}'s Room`}
                  maxLength={50}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={!isConnected}>
                创建房间
              </button>
            </form>
          </div>

          <div className="card">
            <h3>加入房间</h3>
            <form onSubmit={handleJoinRoom}>
              <div className="form-group">
                <label>房间号 (6位数字)</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="请输入6位房间号"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={!isConnected || joinCode.length !== 6}>
                加入房间
              </button>
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
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleQuickJoin(room.room_code)}
                    disabled={!isConnected}
                  >
                    进入
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="room-container">
      <div className="room-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: '5px' }}>{currentRoom.name}</h1>
          <div className="room-code-display">
            房间号: <span className="code-highlight">{currentRoom.roomCode}</span>
            <button
              className="btn btn-sm"
              onClick={() => navigator.clipboard.writeText(currentRoom.roomCode)}
              style={{ marginLeft: '10px' }}
            >
              复制
            </button>
          </div>
        </div>
        <button className="btn btn-danger" onClick={() => leaveRoom()}>
          离开房间
        </button>
      </div>

      <div className="room-content">
        <div className="members-panel">
          <h3>在线成员 ({roomMembers.length})</h3>
          <div className="member-list">
            {roomMembers.map((member) => (
              <div key={member.id} className="member-item">
                <div className="member-avatar">
                  {member.username.charAt(0).toUpperCase()}
                </div>
                <div className="member-info">
                  <div className="member-name">{member.username}</div>
                  {member.role === 'admin' && (
                    <span className="badge badge-admin">管理员</span>
                  )}
                </div>
                {member.id === currentRoom.creatorId && (
                  <span className="badge badge-creator">房主</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="chat-panel">
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
                <div
                  key={msg.id || index}
                  className={`message ${msg.username === user?.username ? 'own-message' : 'other-message'}`}
                >
                  <div className="message-sender">{msg.username}</div>
                  <div className="message-bubble">
                    {msg.content}
                  </div>
                  <div className="message-time">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </div>
                </div>
              )
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form className="message-input-area" onSubmit={handleSendMessage}>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="输入消息..."
              className="message-input"
            />
            <button type="submit" className="btn btn-primary" disabled={!message.trim()}>
              发送
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Rooms;
