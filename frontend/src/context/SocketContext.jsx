import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomMembers, setRoomMembers] = useState([]);
  const [roomMessages, setRoomMessages] = useState([]);
  const [globalSolvedFeed, setGlobalSolvedFeed] = useState([]);

  const connectSocket = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token || socket) return;

    const newSocket = io('/', {
      transports: ['websocket', 'polling'],
      autoConnect: true
    });

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      setIsConnected(true);
      newSocket.emit('authenticate', { token });
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    newSocket.on('authenticated', (data) => {
      console.log('Socket authenticated');
    });

    newSocket.on('auth_error', (data) => {
      console.error('Socket auth error:', data.message);
    });

    newSocket.on('room_created', (data) => {
      setCurrentRoom(data);
      setRoomMembers(data.members || []);
    });

    newSocket.on('room_joined', (data) => {
      setCurrentRoom(data);
      setRoomMembers(data.members || []);
    });

    newSocket.on('room_left', (data) => {
      setCurrentRoom(null);
      setRoomMembers([]);
      setRoomMessages([]);
    });

    newSocket.on('room_error', (data) => {
      console.error('Room error:', data.message);
      alert(data.message);
    });

    newSocket.on('member_list', (data) => {
      setRoomMembers(data.members || []);
    });

    newSocket.on('member_joined', (data) => {
      setRoomMembers(prev => {
        if (prev.find(m => m.id === data.user.id)) return prev;
        return [...prev, data.user];
      });
    });

    newSocket.on('member_left', (data) => {
      setRoomMembers(prev => prev.filter(m => m.id !== data.user.id));
    });

    newSocket.on('room_history', (data) => {
      setRoomMessages(data.messages || []);
    });

    newSocket.on('new_message', (message) => {
      setRoomMessages(prev => [...prev, message]);
    });

    newSocket.on('room_solved', (data) => {
      setRoomMessages(prev => [...prev, {
        id: Date.now(),
        type: 'solved',
        username: data.username,
        content: data.content,
        created_at: data.timestamp
      }]);
    });

    newSocket.on('global_solved', (data) => {
      setGlobalSolvedFeed(prev => [data, ...prev].slice(0, 20));
    });

    newSocket.on('submission_updated', (data) => {
      const event = new CustomEvent('submission_updated', { detail: data });
      window.dispatchEvent(event);
    });

    newSocket.on('rankings_updated', () => {
      const event = new CustomEvent('rankings_updated');
      window.dispatchEvent(event);
    });

    setSocket(newSocket);
    return newSocket;
  }, [user, socket]);

  const disconnectSocket = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
      setCurrentRoom(null);
      setRoomMembers([]);
      setRoomMessages([]);
    }
  }, [socket]);

  const createRoom = useCallback((name) => {
    if (socket) {
      socket.emit('create_room', { name });
    }
  }, [socket]);

  const joinRoom = useCallback((roomCode) => {
    if (socket) {
      socket.emit('join_room', { roomCode });
    }
  }, [socket]);

  const leaveRoom = useCallback((roomCode) => {
    if (socket && currentRoom) {
      socket.emit('leave_room', { roomCode: roomCode || currentRoom.roomCode });
      setCurrentRoom(null);
      setRoomMembers([]);
      setRoomMessages([]);
    }
  }, [socket, currentRoom]);

  const sendMessage = useCallback((content) => {
    if (socket && currentRoom) {
      socket.emit('send_message', { roomCode: currentRoom.roomCode, content });
    }
  }, [socket, currentRoom]);

  useEffect(() => {
    if (user && !socket) {
      connectSocket();
    }
    if (!user && socket) {
      disconnectSocket();
    }
  }, [user, socket, connectSocket, disconnectSocket]);

  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const value = {
    socket,
    isConnected,
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
