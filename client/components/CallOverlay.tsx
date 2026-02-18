import React, { useEffect, useMemo, useRef } from 'react';
import { Camera, CameraOff, Maximize2, Minimize2, Phone, PhoneOff, Video } from 'lucide-react';
import { RemoteParticipant } from '../hooks/chat/useWebRTCCall';
import './CallOverlay.css';

interface IncomingCall {
    callerDisplayName: string;
    mode: 'audio' | 'video';
    isOngoing?: boolean;
}

interface CallOverlayProps {
    callStatus: 'idle' | 'calling' | 'incoming' | 'connecting' | 'in-call';
    callMode: 'audio' | 'video';
    incomingCall: IncomingCall | null;
    localStream: MediaStream | null;
    remoteParticipants: RemoteParticipant[];
    callPeerName: string;
    callError: string | null;
    cameraEnabled: boolean;
    toggleCamera: () => void;
    acceptCall: () => void;
    declineCall: () => void;
    endCall: () => void;
}

const ParticipantTile: React.FC<{ participant: RemoteParticipant; callMode: 'audio' | 'video' }> = ({ participant, callMode }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = participant.stream;
            videoRef.current.play().catch(() => { });
        }
    }, [participant.stream]);

    return (
        <div className="call_remote_tile">
            {callMode === 'video' ? (
                <video ref={videoRef} className="call_video_remote" autoPlay playsInline muted />
            ) : (
                <div className="call_audio_only">
                    <Phone size={24} />
                    <span>{participant.displayName}</span>
                </div>
            )}
            <span className="call_remote_name">{participant.displayName}</span>
        </div>
    );
};

type MixerNode = {
    streamId: string;
    source: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    gain: GainNode;
    data: Uint8Array;
};

const CallAudioMixer: React.FC<{ participants: RemoteParticipant[] }> = ({ participants }) => {
    const contextRef = useRef<AudioContext | null>(null);
    const compressorRef = useRef<DynamicsCompressorNode | null>(null);
    const nodesRef = useRef<Map<string, MixerNode>>(new Map());
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!contextRef.current) {
            const audioContext = new AudioContext();
            const compressor = audioContext.createDynamicsCompressor();
            compressor.threshold.value = -24;
            compressor.knee.value = 30;
            compressor.ratio.value = 8;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;
            compressor.connect(audioContext.destination);
            contextRef.current = audioContext;
            compressorRef.current = compressor;
        }

        const audioContext = contextRef.current;
        const compressor = compressorRef.current;
        if (!audioContext || !compressor) return;

        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(() => { });
        }

        const ids = new Set(participants.map(p => p.userId));

        for (const participant of participants) {
            const audioTracks = participant.stream.getAudioTracks();
            if (!audioTracks || audioTracks.length === 0) {
                const existingNoAudio = nodesRef.current.get(participant.userId);
                if (existingNoAudio) {
                    existingNoAudio.source.disconnect();
                    existingNoAudio.analyser.disconnect();
                    existingNoAudio.gain.disconnect();
                    nodesRef.current.delete(participant.userId);
                }
                continue;
            }

            const existing = nodesRef.current.get(participant.userId);
            if (existing && existing.streamId === participant.stream.id) continue;
            if (existing) {
                existing.source.disconnect();
                existing.analyser.disconnect();
                existing.gain.disconnect();
                nodesRef.current.delete(participant.userId);
            }

            let source: MediaStreamAudioSourceNode;
            try {
                source = audioContext.createMediaStreamSource(participant.stream);
            } catch (_error) {
                continue;
            }
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.75;
            const gain = audioContext.createGain();
            gain.gain.value = 1;

            source.connect(analyser);
            analyser.connect(gain);
            gain.connect(compressor);

            nodesRef.current.set(participant.userId, {
                streamId: participant.stream.id,
                source,
                analyser,
                gain,
                data: new Uint8Array(analyser.fftSize)
            });
        }

        for (const [userId, node] of nodesRef.current.entries()) {
            if (ids.has(userId)) continue;
            node.source.disconnect();
            node.analyser.disconnect();
            node.gain.disconnect();
            nodesRef.current.delete(userId);
        }

        const calculateLevel = (node: MixerNode): number => {
            node.analyser.getByteTimeDomainData(node.data);
            let sum = 0;
            for (let i = 0; i < node.data.length; i += 1) {
                const centered = (node.data[i] - 128) / 128;
                sum += centered * centered;
            }
            return Math.sqrt(sum / node.data.length);
        };

        const tick = () => {
            if (nodesRef.current.size === 0) {
                rafRef.current = requestAnimationFrame(tick);
                return;
            }

            let dominantUserId: string | null = null;
            let dominantLevel = 0;
            const levels = new Map<string, number>();

            for (const [userId, node] of nodesRef.current.entries()) {
                let level = 0;
                try {
                    level = calculateLevel(node);
                } catch (_error) {
                    continue;
                }
                levels.set(userId, level);
                if (level > dominantLevel) {
                    dominantLevel = level;
                    dominantUserId = userId;
                }
            }

            const speechThreshold = 0.02;
            const activeSpeakers = Array.from(levels.values()).filter(level => level > speechThreshold).length;
            const shouldDuck = activeSpeakers >= 2 && dominantUserId !== null;

            for (const [userId, node] of nodesRef.current.entries()) {
                const targetGain = shouldDuck
                    ? (userId === dominantUserId ? 1 : 0.4)
                    : 1;
                const current = node.gain.gain.value;
                node.gain.gain.value = current + (targetGain - current) * 0.18;
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(tick);
        }

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [participants]);

    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
            for (const node of nodesRef.current.values()) {
                node.source.disconnect();
                node.analyser.disconnect();
                node.gain.disconnect();
            }
            nodesRef.current.clear();
            if (compressorRef.current) {
                compressorRef.current.disconnect();
            }
            if (contextRef.current) {
                contextRef.current.close().catch(() => { });
            }
        };
    }, []);

    return null;
};

export const CallOverlay: React.FC<CallOverlayProps> = ({
    callStatus,
    callMode,
    incomingCall,
    localStream,
    remoteParticipants,
    callPeerName,
    callError,
    cameraEnabled,
    toggleCamera,
    acceptCall,
    declineCall,
    endCall
}) => {
    const [isMinimized, setIsMinimized] = React.useState(false);
    const localVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.play().catch(() => { });
        }
    }, [localStream, cameraEnabled]);

    const showIncoming = callStatus === 'incoming' && incomingCall;
    const title = showIncoming
        ? (incomingCall.isOngoing
            ? `${incomingCall.callerDisplayName}'s call is active`
            : `${incomingCall.callerDisplayName} is calling...`)
        : (callPeerName || 'Connecting call...');
    const subtitle = showIncoming
        ? (incomingCall.isOngoing ? 'Join ongoing call' : 'Incoming call')
        : (callMode === 'video' ? 'Video call' : 'Voice call');

    const gridClass = useMemo(() => {
        const count = Math.max(remoteParticipants.length, 1);
        if (count === 1) return 'call_remote_grid one';
        if (count === 2) return 'call_remote_grid two';
        return 'call_remote_grid many';
    }, [remoteParticipants.length]);

    useEffect(() => {
        if (callStatus === 'idle') {
            setIsMinimized(false);
        }
    }, [callStatus]);

    if (callStatus === 'idle') return null;

    const persistentAudio = (
        <div className="call_persistent_media" aria-hidden="true">
            <CallAudioMixer participants={remoteParticipants} />
        </div>
    );

    if (isMinimized) {
        return (
            <>
                {persistentAudio}
                <div className="call_minimized_chip">
                    <button
                        type="button"
                        className="call_minimized_expand"
                        onClick={() => setIsMinimized(false)}
                        title="Restore call"
                    >
                        <Maximize2 size={14} />
                        <span>
                            {showIncoming
                                ? (incomingCall?.isOngoing ? 'Join call' : 'Incoming call')
                                : (callPeerName || (callMode === 'video' ? 'Video call' : 'Voice call'))}
                        </span>
                    </button>
                    {showIncoming && incomingCall ? (
                        <>
                            <button
                                type="button"
                                className="call_minimized_accept"
                                onClick={acceptCall}
                                title={incomingCall.isOngoing ? 'Join call' : 'Accept call'}
                            >
                                {incomingCall.mode === 'video' ? <Video size={14} /> : <Phone size={14} />}
                            </button>
                            <button
                                type="button"
                                className="call_minimized_end"
                                onClick={declineCall}
                                title="Decline call"
                            >
                                <PhoneOff size={14} />
                            </button>
                        </>
                    ) : (
                    <button
                        type="button"
                        className="call_minimized_end"
                        onClick={endCall}
                        title="Leave call"
                    >
                        <PhoneOff size={14} />
                    </button>
                    )}
                </div>
            </>
        );
    }

    return (
        <>
            {persistentAudio}
            <div className={`call_overlay ${showIncoming ? 'call_overlay_incoming' : ''}`}>
                <div className="call_card">
                    <div className="call_header">
                        <div>
                            <h3>{title}</h3>
                            <p>{subtitle} {!showIncoming && remoteParticipants.length > 0 ? `- ${remoteParticipants.length} participant(s)` : ''}</p>
                        </div>
                        <button
                            type="button"
                            className="call_header_btn"
                            onClick={() => setIsMinimized(true)}
                            title="Minimize call"
                        >
                            <Minimize2 size={16} />
                        </button>
                    </div>

                    {callError && <div className="call_error">{callError}</div>}

                    {showIncoming ? (
                        <div className="call_media incoming_compact">
                            <div className="call_audio_only waiting">
                                <Phone size={24} />
                                <span>{incomingCall.isOngoing ? 'A room call is currently active.' : 'Someone is inviting you to join.'}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="call_media">
                            {remoteParticipants.length > 0 ? (
                                <div className={gridClass}>
                                    {remoteParticipants.map(participant => (
                                        <ParticipantTile
                                            key={participant.userId}
                                            participant={participant}
                                            callMode={callMode}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="call_audio_only waiting">
                                    <Phone size={28} />
                                    <span>{callStatus === 'in-call' ? 'Connected' : 'Waiting for participants...'}</span>
                                </div>
                            )}

                            {callMode === 'video' && cameraEnabled && (
                                <video ref={localVideoRef} className="call_video_local" autoPlay playsInline muted />
                            )}
                        </div>
                    )}

                    <div className="call_actions">
                        {showIncoming ? (
                            <>
                                <button type="button" className="call_btn accept" onClick={acceptCall} title="Accept call">
                                    {incomingCall.mode === 'video' ? <Video size={18} /> : <Phone size={18} />}
                                </button>
                                <button type="button" className="call_btn end" onClick={declineCall} title="Decline call">
                                    <PhoneOff size={18} />
                                </button>
                            </>
                        ) : (
                            <>
                                {callMode === 'video' && (
                                    <button
                                        type="button"
                                        className={`call_btn ${cameraEnabled ? 'camera_on' : 'camera_off'}`}
                                        onClick={toggleCamera}
                                        title={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
                                    >
                                        {cameraEnabled ? <Camera size={18} /> : <CameraOff size={18} />}
                                    </button>
                                )}
                                <button type="button" className="call_btn end" onClick={endCall} title="Leave call">
                                    <PhoneOff size={18} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};
