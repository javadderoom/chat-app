import { useCallback, useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';

type CallMode = 'audio' | 'video';
type CallStatus = 'idle' | 'calling' | 'incoming' | 'connecting' | 'in-call';

interface User {
    id: string;
    username: string;
    displayName: string;
}

interface IncomingCall {
    chatId: string;
    callerId: string;
    callerDisplayName: string;
    mode: CallMode;
    isOngoing?: boolean;
}

interface JoinableCall {
    chatId: string;
    callerId: string;
    callerDisplayName: string;
    mode: CallMode;
}

export interface RemoteParticipant {
    userId: string;
    displayName: string;
    stream: MediaStream;
}

interface UseWebRTCCallOptions {
    socket: Socket | null;
    activeChatId: string | null;
    user: User | null;
}

const buildRtcConfig = (): RTCConfiguration => {
    const turnUrls = (import.meta.env.VITE_TURN_URLS || '')
        .split(',')
        .map((value: string) => value.trim())
        .filter(Boolean);
    const turnUsername = import.meta.env.VITE_TURN_USERNAME || '';
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL || '';

    const iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    if (turnUrls.length > 0) {
        iceServers.push({
            urls: turnUrls,
            username: turnUsername,
            credential: turnCredential
        });
    }

    return { iceServers };
};

export const useWebRTCCall = ({ socket, activeChatId, user }: UseWebRTCCallOptions) => {
    const [callStatus, setCallStatus] = useState<CallStatus>('idle');
    const [callMode, setCallMode] = useState<CallMode>('audio');
    const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
    const [callPeerName, setCallPeerName] = useState<string>('');
    const [callError, setCallError] = useState<string | null>(null);
    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [joinableCallsByChat, setJoinableCallsByChat] = useState<Record<string, JoinableCall>>({});

    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
    const participantNamesRef = useRef<Map<string, string>>(new Map());
    const currentChatIdRef = useRef<string | null>(activeChatId);
    const activeCallChatIdRef = useRef<string | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        currentChatIdRef.current = activeChatId;
    }, [activeChatId]);

    const updateCallTitle = useCallback(() => {
        const names = Array.from(participantNamesRef.current.values()).filter(Boolean);
        if (names.length === 0) {
            if (callStatus === 'calling') {
                setCallPeerName('Waiting for participants...');
            } else {
                setCallPeerName('');
            }
            return;
        }

        if (names.length === 1) {
            setCallPeerName(names[0]);
            return;
        }

        setCallPeerName(`${names[0]} +${names.length - 1}`);
    }, [callStatus]);

    const syncRemoteParticipants = useCallback(() => {
        const list: RemoteParticipant[] = [];
        for (const [userId, stream] of remoteStreamsRef.current.entries()) {
            list.push({
                userId,
                displayName: participantNamesRef.current.get(userId) || 'Participant',
                stream
            });
        }
        setRemoteParticipants(list);
    }, []);

    const closePeer = useCallback((targetUserId: string) => {
        const peer = peersRef.current.get(targetUserId);
        if (peer) {
            peer.onicecandidate = null;
            peer.ontrack = null;
            peer.onconnectionstatechange = null;
            peer.oniceconnectionstatechange = null;
            peer.close();
        }
        peersRef.current.delete(targetUserId);
        pendingCandidatesRef.current.delete(targetUserId);
        remoteStreamsRef.current.delete(targetUserId);
        participantNamesRef.current.delete(targetUserId);
        syncRemoteParticipants();
    }, [syncRemoteParticipants]);

    const stopLocalMediaOnly = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        setLocalStream(null);
    }, []);

    const cleanupCall = useCallback((keepIncoming = false, preserveError = false) => {
        for (const userId of Array.from(peersRef.current.keys())) {
            closePeer(userId);
        }

        peersRef.current.clear();
        pendingCandidatesRef.current.clear();
        remoteStreamsRef.current.clear();
        participantNamesRef.current.clear();

        stopLocalMediaOnly();
        setRemoteParticipants([]);
        setCallStatus('idle');
        setCallPeerName('');
        setCameraEnabled(false);
        if (!preserveError) {
            setCallError(null);
        }
        activeCallChatIdRef.current = null;
        if (!keepIncoming) {
            setIncomingCall(null);
        }
    }, [closePeer, stopLocalMediaOnly]);

    const ensureLocalStream = useCallback(async (mode: CallMode, withCamera = false) => {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: mode === 'video'
        });
        if (mode === 'video') {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !!withCamera;
            }
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setCameraEnabled(mode === 'video' && !!withCamera);
    }, []);

    const toggleCamera = useCallback(async () => {
        if (callMode !== 'video' || !localStreamRef.current) return;

        const stream = localStreamRef.current;
        const existingTrack = stream.getVideoTracks()[0];
        if (!existingTrack) {
            setCallError('Camera track is unavailable in current call.');
            return;
        }
        const nextEnabled = !cameraEnabled;
        existingTrack.enabled = nextEnabled;
        if (nextEnabled) {
            setCallError(null);
        }
        setCameraEnabled(nextEnabled);
        setLocalStream(stream);
    }, [callMode, cameraEnabled]);

    const flushPendingCandidates = useCallback(async (targetUserId: string, peer: RTCPeerConnection) => {
        const queue = pendingCandidatesRef.current.get(targetUserId) || [];
        pendingCandidatesRef.current.set(targetUserId, []);

        for (const candidate of queue) {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }, []);

    const createPeerConnection = useCallback((chatId: string, targetUserId: string, targetDisplayName?: string) => {
        if (!socket || !localStreamRef.current) return null;

        const existing = peersRef.current.get(targetUserId);
        if (existing) return existing;

        const peer = new RTCPeerConnection(buildRtcConfig());
        peersRef.current.set(targetUserId, peer);

        if (targetDisplayName) {
            participantNamesRef.current.set(targetUserId, targetDisplayName);
            updateCallTitle();
        }

        const incomingRemote = new MediaStream();
        remoteStreamsRef.current.set(targetUserId, incomingRemote);
        syncRemoteParticipants();

        peer.onicecandidate = (event) => {
            if (!event.candidate) return;
            socket.emit('call:ice', {
                chatId,
                targetUserId,
                candidate: event.candidate.toJSON()
            });
        };

        peer.ontrack = (event) => {
            const remote = remoteStreamsRef.current.get(targetUserId);
            if (!remote) return;

            const incomingTracks =
                event.streams && event.streams[0] && event.streams[0].getTracks().length > 0
                    ? event.streams[0].getTracks()
                    : [event.track];

            incomingTracks.forEach(track => {
                const exists = remote.getTracks().some(existingTrack => existingTrack.id === track.id);
                if (!exists) {
                    remote.addTrack(track);
                }
            });

            syncRemoteParticipants();
            setCallStatus('in-call');
        };

        peer.onconnectionstatechange = () => {
            const state = peer.connectionState;

            if (state === 'connected') {
                setCallStatus('in-call');
                return;
            }

            if (state === 'failed' || state === 'closed') {
                closePeer(targetUserId);
                if (state === 'failed') {
                    setCallError('Peer connection failed. Check TURN server and network path.');
                }

                if (peersRef.current.size === 0 && callStatus !== 'incoming') {
                    cleanupCall(false, state === 'failed');
                }
            }
        };

        peer.oniceconnectionstatechange = () => {
            const state = peer.iceConnectionState;
            if (state === 'failed' || state === 'closed') {
                closePeer(targetUserId);
                if (peersRef.current.size === 0 && callStatus !== 'incoming') {
                    cleanupCall(false, state === 'failed');
                }
            }
        };

        localStreamRef.current.getTracks().forEach(track => {
            peer.addTrack(track, localStreamRef.current as MediaStream);
        });

        return peer;
    }, [callStatus, cleanupCall, closePeer, socket, syncRemoteParticipants, updateCallTitle]);

    const createAndSendOffer = useCallback(async (chatId: string, targetUserId: string, targetDisplayName?: string) => {
        const peer = createPeerConnection(chatId, targetUserId, targetDisplayName);
        if (!peer || !socket) return;

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        socket.emit('call:offer', {
            chatId,
            targetUserId,
            offer
        });
    }, [createPeerConnection, socket]);

    const startCall = useCallback(async (mode: CallMode) => {
        if (!socket || !socket.connected) {
            setCallError('Not connected to signaling server.');
            return;
        }
        if (!activeChatId) {
            setCallError('Select a chat before starting a call.');
            return;
        }
        if (!user) {
            setCallError('User context is missing. Please re-login.');
            return;
        }
        if (callStatus !== 'idle') return;

        try {
            setCallError(null);
            setCallMode(mode);
            await ensureLocalStream(mode, false);
            activeCallChatIdRef.current = activeChatId;
            setCallStatus('calling');
            setCallPeerName('Waiting for participants...');
            socket.emit('call:start', { chatId: activeChatId, isVideo: mode === 'video' });
        } catch (_error) {
            setCallStatus('idle');
            setCallError('Microphone/camera permission denied or unavailable. Use HTTPS and allow device access.');
            stopLocalMediaOnly();
        }
    }, [activeChatId, callStatus, ensureLocalStream, socket, stopLocalMediaOnly, user]);

    const acceptCall = useCallback(async () => {
        if (!socket || !incomingCall) return;

        try {
            setCallError(null);
            setCallMode(incomingCall.mode);
            await ensureLocalStream(incomingCall.mode, false);
            activeCallChatIdRef.current = incomingCall.chatId;
            setCallStatus('connecting');

            socket.emit('call:accept', {
                chatId: incomingCall.chatId,
                callerId: incomingCall.callerId,
                isVideo: incomingCall.mode === 'video'
            });
            setIncomingCall(null);
        } catch (_error) {
            setCallStatus('idle');
            setCallError('Could not access microphone/camera. Check browser permissions and HTTPS.');
            socket.emit('call:decline', {
                chatId: incomingCall.chatId,
                callerId: incomingCall.callerId
            });
            stopLocalMediaOnly();
            setIncomingCall(null);
        }
    }, [ensureLocalStream, incomingCall, socket, stopLocalMediaOnly]);

    const declineCall = useCallback(() => {
        if (!socket || !incomingCall) return;
        socket.emit('call:decline', {
            chatId: incomingCall.chatId,
            callerId: incomingCall.callerId
        });
        setJoinableCallsByChat(prev => {
            if (!prev[incomingCall.chatId]) return prev;
            const next = { ...prev };
            delete next[incomingCall.chatId];
            return next;
        });
        setIncomingCall(null);
        setCallStatus('idle');
    }, [incomingCall, socket]);

    const joinActiveCall = useCallback(async (chatId: string) => {
        if (!chatId) return;
        const joinable = joinableCallsByChat[chatId];
        if (!joinable) return;
        if (!socket || !socket.connected) {
            setCallError('Not connected to signaling server.');
            return;
        }

        try {
            setCallError(null);
            setCallMode(joinable.mode);
            await ensureLocalStream(joinable.mode, false);
            activeCallChatIdRef.current = joinable.chatId;
            setCallStatus('connecting');
            socket.emit('call:accept', {
                chatId: joinable.chatId,
                callerId: joinable.callerId,
                isVideo: joinable.mode === 'video'
            });
            setIncomingCall(null);
            setJoinableCallsByChat(prev => {
                if (!prev[joinable.chatId]) return prev;
                const next = { ...prev };
                delete next[joinable.chatId];
                return next;
            });
        } catch (_error) {
            setCallStatus('idle');
            setCallError('Could not access microphone/camera. Check browser permissions and HTTPS.');
            stopLocalMediaOnly();
        }
    }, [ensureLocalStream, joinableCallsByChat, socket, stopLocalMediaOnly]);

    const endCall = useCallback(() => {
        const chatId = activeCallChatIdRef.current || currentChatIdRef.current;
        if (socket && chatId) {
            socket.emit('call:end', {
                chatId,
                reason: 'left'
            });
        }
        cleanupCall();
    }, [cleanupCall, socket]);

    useEffect(() => {
        if (!socket) return;

        const onIncomingCall = (data: any) => {
            if (!data?.chatId || !data?.callerId) return;

            const mode: CallMode = data.isVideo ? 'video' : 'audio';
            if (data.isOngoing) {
                setJoinableCallsByChat(prev => ({
                    ...prev,
                    [data.chatId]: {
                        chatId: data.chatId,
                        callerId: data.callerId,
                        callerDisplayName: data.callerDisplayName || data.callerUsername || 'Unknown',
                        mode
                    }
                }));
            }
            const sameCall = activeCallChatIdRef.current && activeCallChatIdRef.current === data.chatId && callStatus !== 'idle';
            if (sameCall) {
                // Already in this room call; acknowledge so caller can establish mesh peer.
                socket.emit('call:accept', {
                    chatId: data.chatId,
                    callerId: data.callerId,
                    isVideo: mode === 'video'
                });
                return;
            }

            if (callStatus !== 'idle') {
                socket.emit('call:decline', { chatId: data.chatId, callerId: data.callerId });
                return;
            }

            setCallMode(mode);
            setIncomingCall({
                chatId: data.chatId,
                callerId: data.callerId,
                callerDisplayName: data.callerDisplayName || data.callerUsername || 'Unknown',
                mode,
                isOngoing: !!data.isOngoing
            });
            setCallStatus('incoming');
        };

        const onCallAccepted = async (data: any) => {
            if (!data?.chatId || !data?.calleeId) return;
            if (!localStreamRef.current) return;

            activeCallChatIdRef.current = data.chatId;
            setCallMode(data.isVideo ? 'video' : callMode);
            setCallStatus('connecting');

            participantNamesRef.current.set(
                data.calleeId,
                data.calleeDisplayName || data.calleeUsername || 'Participant'
            );
            updateCallTitle();

            try {
                await createAndSendOffer(
                    data.chatId,
                    data.calleeId,
                    data.calleeDisplayName || data.calleeUsername || 'Participant'
                );
            } catch (_error) {
                setCallError('Failed to establish call with participant.');
            }
        };

        const onParticipantJoined = async (data: any) => {
            if (!data?.chatId || !data?.joinedById) return;
            if (user?.id && data.joinedById === user.id) return;
            if (!localStreamRef.current) return;

            const activeChat = activeCallChatIdRef.current;
            if (!activeChat || activeChat !== data.chatId) return;
            if (peersRef.current.has(data.joinedById)) return;

            participantNamesRef.current.set(
                data.joinedById,
                data.joinedByDisplayName || data.joinedByUsername || 'Participant'
            );
            updateCallTitle();

            try {
                await createAndSendOffer(
                    data.chatId,
                    data.joinedById,
                    data.joinedByDisplayName || data.joinedByUsername || 'Participant'
                );
            } catch (_error) {
                setCallError('Failed to connect a new participant.');
            }
        };

        const onCallDeclined = (data: any) => {
            const declinedName = data?.declinedByDisplayName || data?.declinedByUsername || 'Participant';
            if (callStatus === 'calling' && peersRef.current.size === 0) {
                setCallError(`${declinedName} declined the call.`);
            }
        };

        const onCallOffer = async (data: any) => {
            if (!data?.chatId || !data?.fromUserId || !data?.offer) return;
            if (!localStreamRef.current) return;

            activeCallChatIdRef.current = data.chatId;
            setCallStatus('connecting');

            participantNamesRef.current.set(
                data.fromUserId,
                data.fromDisplayName || data.fromUsername || 'Participant'
            );
            updateCallTitle();

            try {
                const peer = createPeerConnection(
                    data.chatId,
                    data.fromUserId,
                    data.fromDisplayName || data.fromUsername || 'Participant'
                );
                if (!peer) return;

                await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
                await flushPendingCandidates(data.fromUserId, peer);

                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);

                socket.emit('call:answer', {
                    chatId: data.chatId,
                    targetUserId: data.fromUserId,
                    answer
                });
            } catch (_error) {
                setCallError('Failed to accept call offer.');
                closePeer(data.fromUserId);
            }
        };

        const onCallAnswer = async (data: any) => {
            if (!data?.fromUserId || !data?.answer) return;

            const peer = peersRef.current.get(data.fromUserId);
            if (!peer) return;

            try {
                await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
                await flushPendingCandidates(data.fromUserId, peer);
            } catch (_error) {
                setCallError('Failed to process call answer.');
                closePeer(data.fromUserId);
            }
        };

        const onCallIce = async (data: any) => {
            if (!data?.fromUserId || !data?.candidate) return;

            const peer = peersRef.current.get(data.fromUserId);
            if (!peer || !peer.remoteDescription) {
                const queue = pendingCandidatesRef.current.get(data.fromUserId) || [];
                queue.push(data.candidate);
                pendingCandidatesRef.current.set(data.fromUserId, queue);
                return;
            }

            try {
                await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (error) {
                console.error('Failed to add ICE candidate:', error);
            }
        };

        const onCallEnded = (data: any) => {
            const endedById = data?.endedById;
            const endedChatId = data?.chatId;

            if (endedChatId) {
                setJoinableCallsByChat(prev => {
                    if (!prev[endedChatId]) return prev;
                    const next = { ...prev };
                    delete next[endedChatId];
                    return next;
                });
            }

            if (endedById && peersRef.current.has(endedById)) {
                closePeer(endedById);
                updateCallTitle();

                if (peersRef.current.size === 0 && callStatus !== 'calling') {
                    cleanupCall();
                }
                return;
            }

            cleanupCall();
        };

        socket.on('call:incoming', onIncomingCall);
        socket.on('call:accepted', onCallAccepted);
        socket.on('call:participant-joined', onParticipantJoined);
        socket.on('call:declined', onCallDeclined);
        socket.on('call:offer', onCallOffer);
        socket.on('call:answer', onCallAnswer);
        socket.on('call:ice', onCallIce);
        socket.on('call:ended', onCallEnded);

        return () => {
            socket.off('call:incoming', onIncomingCall);
            socket.off('call:accepted', onCallAccepted);
            socket.off('call:participant-joined', onParticipantJoined);
            socket.off('call:declined', onCallDeclined);
            socket.off('call:offer', onCallOffer);
            socket.off('call:answer', onCallAnswer);
            socket.off('call:ice', onCallIce);
            socket.off('call:ended', onCallEnded);
        };
    }, [
        callMode,
        callStatus,
        cleanupCall,
        closePeer,
        createAndSendOffer,
        createPeerConnection,
        flushPendingCandidates,
        socket,
        updateCallTitle,
        user?.id
    ]);

    useEffect(() => {
        return () => {
            cleanupCall();
        };
    }, [cleanupCall]);

    return {
        callStatus,
        callMode,
        incomingCall,
        localStream,
        remoteParticipants,
        remoteStream: remoteParticipants[0]?.stream || null,
        callPeerName,
        callError,
        cameraEnabled,
        toggleCamera,
        joinableCallsByChat,
        hasJoinableCallInActiveChat: !!(activeChatId && joinableCallsByChat[activeChatId]),
        startVoiceCall: () => startCall('audio'),
        startVideoCall: () => startCall('video'),
        joinActiveCall,
        acceptCall,
        declineCall,
        endCall
    };
};
