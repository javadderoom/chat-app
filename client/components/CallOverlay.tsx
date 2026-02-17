import React, { useEffect, useMemo, useRef } from 'react';
import { Maximize2, Minimize2, Phone, PhoneOff, Video } from 'lucide-react';
import { RemoteParticipant } from '../hooks/chat/useWebRTCCall';
import './CallOverlay.css';

interface IncomingCall {
    callerDisplayName: string;
    mode: 'audio' | 'video';
}

interface CallOverlayProps {
    callStatus: 'idle' | 'calling' | 'incoming' | 'connecting' | 'in-call';
    callMode: 'audio' | 'video';
    incomingCall: IncomingCall | null;
    localStream: MediaStream | null;
    remoteParticipants: RemoteParticipant[];
    callPeerName: string;
    callError: string | null;
    acceptCall: () => void;
    declineCall: () => void;
    endCall: () => void;
}

const ParticipantTile: React.FC<{ participant: RemoteParticipant; callMode: 'audio' | 'video' }> = ({ participant, callMode }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = participant.stream;
        }
        if (audioRef.current) {
            audioRef.current.srcObject = participant.stream;
            audioRef.current.play().catch(() => { });
        }
    }, [participant.stream]);

    return (
        <div className="call_remote_tile">
            <audio ref={audioRef} autoPlay />
            {callMode === 'video' ? (
                <video ref={videoRef} className="call_video_remote" autoPlay playsInline />
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

export const CallOverlay: React.FC<CallOverlayProps> = ({
    callStatus,
    callMode,
    incomingCall,
    localStream,
    remoteParticipants,
    callPeerName,
    callError,
    acceptCall,
    declineCall,
    endCall
}) => {
    const [isMinimized, setIsMinimized] = React.useState(false);
    const localVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    const showIncoming = callStatus === 'incoming' && incomingCall;
    const title = showIncoming
        ? `${incomingCall.callerDisplayName} is calling...`
        : (callPeerName || 'Connecting call...');
    const subtitle = callMode === 'video' ? 'Video call' : 'Voice call';

    const gridClass = useMemo(() => {
        const count = Math.max(remoteParticipants.length, 1);
        if (count === 1) return 'call_remote_grid one';
        if (count === 2) return 'call_remote_grid two';
        return 'call_remote_grid many';
    }, [remoteParticipants.length]);

    useEffect(() => {
        if (callStatus === 'idle' || callStatus === 'incoming') {
            setIsMinimized(false);
        }
    }, [callStatus]);

    if (callStatus === 'idle') return null;

    if (isMinimized && !showIncoming) {
        return (
            <div className="call_minimized_chip">
                <button
                    type="button"
                    className="call_minimized_expand"
                    onClick={() => setIsMinimized(false)}
                    title="Restore call"
                >
                    <Maximize2 size={14} />
                    <span>{callPeerName || (callMode === 'video' ? 'Video call' : 'Voice call')}</span>
                </button>
                <button
                    type="button"
                    className="call_minimized_end"
                    onClick={endCall}
                    title="Leave call"
                >
                    <PhoneOff size={14} />
                </button>
            </div>
        );
    }

    return (
        <div className="call_overlay">
            <div className="call_card">
                <div className="call_header">
                    <div>
                        <h3>{title}</h3>
                        <p>{subtitle} {remoteParticipants.length > 0 ? `- ${remoteParticipants.length} participant(s)` : ''}</p>
                    </div>
                    {!showIncoming && (
                        <button
                            type="button"
                            className="call_header_btn"
                            onClick={() => setIsMinimized(true)}
                            title="Minimize call"
                        >
                            <Minimize2 size={16} />
                        </button>
                    )}
                </div>

                {callError && <div className="call_error">{callError}</div>}

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

                    {callMode === 'video' && (
                        <video ref={localVideoRef} className="call_video_local" autoPlay playsInline muted />
                    )}
                </div>

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
                        <button type="button" className="call_btn end" onClick={endCall} title="Leave call">
                            <PhoneOff size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
