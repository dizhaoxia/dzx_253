import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomMembers, setRoomMembers] = useState([]);
  const [roomMessages, setRoomMessages] = useState([]);
  const [globalSolvedFeed, setGlobalSolvedFeed] = useState([]);

  const setupSocketListeners = useCallback((socket) => {
    const token = localStorage.getItem('token');

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      setIsConnected(true);
      setConnectError(null);
      if (token) {
        socket.emit('authenticate', { token });
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('🔌 Socket connect error:', error.message);
      setConnectError(error.message);
      setIsConnected(false);
    });

    socket.on('authenticated', (data) => {
      console.log('🔐 Socket authenticated');
    });

    socket.on('auth_error', (data) => {
      console.error('🔐 Socket auth error:', data.message);
    });

    socket.on('room_created', (data) => {
      console.log('🏠 Room created:', data);
      setCurrentRoom(data);
      setRoomMembers(data.members || []);
      setRoomMessages([]);
    });

    socket.on('room_joined', (data) => {
      console.log('🏠 Room joined:', data);
      setCurrentRoom(data);
      setRoomMembers(data.members || []);
    });

    socket.on('room_left', (data) => {
      console.log('🚪 Room left:', data.roomCode);
      setCurrentRoom(null);
      setRoomMembers([]);
      setRoomMessages([]);
    });

    socket.on('room_error', (data) => {
      console.error('🏠 Room error:', data.message);
      alert(data.message);
    });

    socket.on('member_list', (data) => {
      setRoomMembers(data.members || []);
    });

    socket.on('member_joined', (data) => {
      setRoomMembers(prev => {
        if (prev.find(m => m.id === data.user.id)) return prev;
        return [...prev, data.user];
      });
    });

    socket.on('member_left', (data) => {
      setRoomMembers(prev => prev.filter(m => m.id !== data.user.id));
    });

    socket.on('room_history', (data) => {
      setRoomMessages(data.messages || []);
    });

    socket.on('new_message', (message) => {
      setRoomMessages(prev => [...prev, message]);
    });

    socket.on('room_solved', (data) => {
      setRoomMessages(prev => [...prev, {
        id: Date.now(),
        type: 'solved',
        username: data.username,
        content: data.content,
        created_at: data.timestamp
      }]);
    });

    socket.on('global_solved', (data) => {
      setGlobalSolvedFeed(prev => [data, ...prev].slice(0, 20));
    });

    socket.on('submission_updated', (data) => {
      const event = new CustomEvent('submission_updated', { detail: data });
      window.dispatchEvent(event);
    });

    socket.on('rankings_updated', () => {
      const event = new CustomEvent('rankings_updated');
      window.dispatchEvent(event);
    });
  }, []);

  const connectSocket = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    if (socketRef.current) return;

    console.log('🔌 Connecting socket...');

    const newSocket = io('/', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    setupSocketListeners(newSocket);
    socketRef.current = newSocket;
  }, [setupSocketListeners]);

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      console.log('🔌 Disconnecting socket...');
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setConnectError(null);
      setCurrentRoom(null);
      setRoomMembers([]);
      setRoomMessages([]);
    }
  }, []);

  const createRoom = useCallback((name) => {
    if (socketRef.current && isConnected) {
      console.log('🏠 Creating room:', name);
      socketRef.current.emit('create_room', { name });
    } else {
      console.warn('⚠️ Socket not connected, cannot create room');
    }
  }, [isConnected]);

  const joinRoom = useCallback((roomCode) => {
    if (socketRef.current && isConnected) {
      console.log('🚪 Joining room:', roomCode);
      socketRef.current.emit('join_room', { roomCode });
    } else {
      console.warn('⚠️ Socket not connected, cannot join room');
    }
  }, [isConnected]);

  const leaveRoom = useCallback((roomCode) => {
    if (socketRef.current && currentRoom) {
      const code = roomCode || currentRoom.roomCode;
      console.log('🚪 Leaving room:', code);
      socketRef.current.emit('leave_room', { roomCode: code });
      setCurrentRoom(null);
      setRoomMembers([]);
      setRoomMessages([]);
    }
  }, [currentRoom]);

  const sendMessage = useCallback((content) => {
    if (socketRef.current && currentRoom) {
      socketRef.current.emit('send_message', { roomCode: currentRoom.roomCode, content });
    }
  }, [currentRoom]);

  useEffect(() => {
    if (user) {
      connectSocket();
    } else {
      disconnectSocket();
    }
  }, [user, connectSocket, disconnectSocket]);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const value = {
    socket: socketRef.current,
    isConnected,
    connectError,
    currentRoom,
    roomMembers,
    roomMessages,
    globalSolvedFeed,
    connectSocket,
    disconnectSocket,
    createRoom,
    joinRoom,
    leaveRoom,
    sendMessage
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
