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
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [callPeerName, setCallPeerName] = useState<string>('');
    const [callError, setCallError] = useState<string | null>(null);

    const peerRef = useRef<RTCPeerConnection | null>(null);
    const targetUserIdRef = useRef<string | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const currentChatIdRef = useRef<string | null>(activeChatId);
    const disconnectTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        currentChatIdRef.current = activeChatId;
    }, [activeChatId]);

    const cleanupCall = useCallback((keepIncoming = false, preserveError = false) => {
        if (disconnectTimeoutRef.current) {
            window.clearTimeout(disconnectTimeoutRef.current);
            disconnectTimeoutRef.current = null;
        }

        if (peerRef.current) {
            peerRef.current.onicecandidate = null;
            peerRef.current.ontrack = null;
            peerRef.current.onconnectionstatechange = null;
            peerRef.current.oniceconnectionstatechange = null;
            peerRef.current.close();
            peerRef.current = null;
        }

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        setLocalStream(null);
        setRemoteStream(null);
        setCallStatus('idle');
        setCallPeerName('');
        if (!preserveError) {
            setCallError(null);
        }
        targetUserIdRef.current = null;
        pendingCandidatesRef.current = [];
        if (!keepIncoming) {
            setIncomingCall(null);
        }
    }, []);

    const stopLocalMediaOnly = useCallback(() => {
        if (disconnectTimeoutRef.current) {
            window.clearTimeout(disconnectTimeoutRef.current);
            disconnectTimeoutRef.current = null;
        }

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        setLocalStream(null);
        setRemoteStream(null);
        targetUserIdRef.current = null;
        pendingCandidatesRef.current = [];
        if (peerRef.current) {
            peerRef.current.onicecandidate = null;
            peerRef.current.ontrack = null;
            peerRef.current.onconnectionstatechange = null;
            peerRef.current.oniceconnectionstatechange = null;
            peerRef.current.close();
            peerRef.current = null;
        }
    }, []);

    const createPeerConnection = useCallback((chatId: string, targetUserId: string) => {
        if (!socket) return null;

        const peer = new RTCPeerConnection(buildRtcConfig());
        peerRef.current = peer;
        targetUserIdRef.current = targetUserId;

        const incomingRemote = new MediaStream();
        setRemoteStream(incomingRemote);

        peer.onicecandidate = (event) => {
            if (!event.candidate || !targetUserIdRef.current) return;
            socket.emit('call:ice', {
                chatId,
                targetUserId: targetUserIdRef.current,
                candidate: event.candidate.toJSON()
            });
        };

        peer.ontrack = (event) => {
            event.streams[0]?.getTracks().forEach(track => {
                incomingRemote.addTrack(track);
            });
            setCallStatus('in-call');
        };

        peer.onconnectionstatechange = () => {
            if (!peerRef.current) return;
            const state = peerRef.current.connectionState;
            if (state === 'failed' || state === 'closed') {
                if (state === 'failed') {
                    setCallError('Peer connection failed. Configure TURN for cross-network calls.');
                }
                cleanupCall(false, state === 'failed');
            }
        };

        peer.oniceconnectionstatechange = () => {
            if (!peerRef.current) return;
            const state = peerRef.current.iceConnectionState;

            if (state === 'disconnected') {
                if (disconnectTimeoutRef.current) {
                    window.clearTimeout(disconnectTimeoutRef.current);
                }
                disconnectTimeoutRef.current = window.setTimeout(() => {
                    cleanupCall();
                    disconnectTimeoutRef.current = null;
                }, 8000);
                return;
            }

            if (disconnectTimeoutRef.current && (state === 'connected' || state === 'completed')) {
                window.clearTimeout(disconnectTimeoutRef.current);
                disconnectTimeoutRef.current = null;
            }

            if (state === 'failed' || state === 'closed') {
                if (state === 'failed') {
                    setCallError('Network path failed. TURN relay is required for many mobile/carrier NATs.');
                }
                cleanupCall(false, state === 'failed');
            }
        };

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                peer.addTrack(track, localStreamRef.current as MediaStream);
            });
        }

        return peer;
    }, [cleanupCall, socket]);

    const ensureLocalStream = useCallback(async (mode: CallMode) => {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: mode === 'video'
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
    }, []);

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
            setCallPeerName('Waiting for answer...');
            await ensureLocalStream(mode);
            setCallStatus('calling');
            socket.emit('call:start', { chatId: activeChatId, isVideo: mode === 'video' });
        } catch (error) {
            setCallStatus('idle');
            setCallError('Microphone/camera permission denied or unavailable. Use HTTPS (or localhost) and allow device access.');
            stopLocalMediaOnly();
        }
    }, [activeChatId, callStatus, ensureLocalStream, socket, stopLocalMediaOnly, user]);

    const acceptCall = useCallback(async () => {
        if (!socket || !incomingCall) return;

        try {
            setCallError(null);
            setCallMode(incomingCall.mode);
            setCallPeerName(incomingCall.callerDisplayName);
            await ensureLocalStream(incomingCall.mode);
            setCallStatus('connecting');
            targetUserIdRef.current = incomingCall.callerId;
            socket.emit('call:accept', {
                chatId: incomingCall.chatId,
                callerId: incomingCall.callerId,
                isVideo: incomingCall.mode === 'video'
            });
            setIncomingCall(null);
        } catch (error) {
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
        setIncomingCall(null);
    }, [incomingCall, socket]);

    const endCall = useCallback(() => {
        if (!socket) {
            cleanupCall();
            return;
        }

        socket.emit('call:end', {
            chatId: currentChatIdRef.current,
            targetUserId: targetUserIdRef.current,
            reason: 'ended'
        });
        cleanupCall();
    }, [cleanupCall, socket]);

    useEffect(() => {
        if (!socket) return;

        const onIncomingCall = (data: any) => {
            if (!data?.chatId || !data?.callerId) return;
            if (callStatus !== 'idle') {
                socket.emit('call:decline', { chatId: data.chatId, callerId: data.callerId });
                return;
            }

            setCallMode(data.isVideo ? 'video' : 'audio');
            setIncomingCall({
                chatId: data.chatId,
                callerId: data.callerId,
                callerDisplayName: data.callerDisplayName || data.callerUsername || 'Unknown',
                mode: data.isVideo ? 'video' : 'audio'
            });
            setCallStatus('incoming');
        };

        const onCallAccepted = async (data: any) => {
            if (!data?.chatId || !data?.calleeId) return;
            if (!currentChatIdRef.current || data.chatId !== currentChatIdRef.current) return;

            try {
                setCallPeerName(data.calleeDisplayName || data.calleeUsername || 'Connected user');
                setCallStatus('connecting');
                setCallMode(data.isVideo ? 'video' : callMode);

                const peer = createPeerConnection(data.chatId, data.calleeId);
                if (!peer) return;

                const offer = await peer.createOffer();
                await peer.setLocalDescription(offer);

                socket.emit('call:offer', {
                    chatId: data.chatId,
                    targetUserId: data.calleeId,
                    offer
                });
            } catch (error) {
                setCallError('Failed to establish call.');
                cleanupCall();
            }
        };

        const onCallDeclined = () => {
            setCallError('Call was declined.');
            cleanupCall();
        };

        const onCallOffer = async (data: any) => {
            if (!data?.chatId || !data?.fromUserId || !data?.offer) return;
            if (!localStreamRef.current) return;

            try {
                setCallStatus('connecting');
                setCallPeerName(data.fromDisplayName || data.fromUsername || 'Connected user');

                const peer = createPeerConnection(data.chatId, data.fromUserId);
                if (!peer) return;

                await peer.setRemoteDescription(new RTCSessionDescription(data.offer));

                while (pendingCandidatesRef.current.length > 0) {
                    const candidate = pendingCandidatesRef.current.shift();
                    if (!candidate) continue;
                    await peer.addIceCandidate(new RTCIceCandidate(candidate));
                }

                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);

                socket.emit('call:answer', {
                    chatId: data.chatId,
                    targetUserId: data.fromUserId,
                    answer
                });
            } catch (error) {
                setCallError('Failed to accept call offer.');
                cleanupCall();
            }
        };

        const onCallAnswer = async (data: any) => {
            if (!data?.answer || !peerRef.current) return;
            try {
                await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));

                while (pendingCandidatesRef.current.length > 0) {
                    const candidate = pendingCandidatesRef.current.shift();
                    if (!candidate) continue;
                    await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                }
            } catch (error) {
                setCallError('Failed to process call answer.');
                cleanupCall();
            }
        };

        const onCallIce = async (data: any) => {
            if (!data?.candidate) return;

            try {
                if (!peerRef.current || !peerRef.current.remoteDescription) {
                    pendingCandidatesRef.current.push(data.candidate);
                    return;
                }
                await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (error) {
                console.error('Failed to add ICE candidate:', error);
            }
        };

        const onCallEnded = () => {
            cleanupCall();
        };

        socket.on('call:incoming', onIncomingCall);
        socket.on('call:accepted', onCallAccepted);
        socket.on('call:declined', onCallDeclined);
        socket.on('call:offer', onCallOffer);
        socket.on('call:answer', onCallAnswer);
        socket.on('call:ice', onCallIce);
        socket.on('call:ended', onCallEnded);

        return () => {
            socket.off('call:incoming', onIncomingCall);
            socket.off('call:accepted', onCallAccepted);
            socket.off('call:declined', onCallDeclined);
            socket.off('call:offer', onCallOffer);
            socket.off('call:answer', onCallAnswer);
            socket.off('call:ice', onCallIce);
            socket.off('call:ended', onCallEnded);
        };
    }, [callMode, callStatus, cleanupCall, createPeerConnection, socket]);

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
        remoteStream,
        callPeerName,
        callError,
        startVoiceCall: () => startCall('audio'),
        startVideoCall: () => startCall('video'),
        acceptCall,
        declineCall,
        endCall
    };
};
