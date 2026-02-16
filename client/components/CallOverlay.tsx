import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
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
    remoteStream: MediaStream | null;
    callPeerName: string;
    callError: string | null;
    acceptCall: () => void;
    declineCall: () => void;
    endCall: () => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
    callStatus,
    callMode,
    incomingCall,
    localStream,
    remoteStream,
    callPeerName,
    callError,
    acceptCall,
    declineCall,
    endCall
}) => {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    useEffect(() => {
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(() => { });
        }
    }, [remoteStream]);

    if (callStatus === 'idle') return null;

    const showIncoming = callStatus === 'incoming' && incomingCall;
    const title = showIncoming
        ? `${incomingCall.callerDisplayName} is calling...`
        : (callPeerName || 'Connecting call...');
    const subtitle = callMode === 'video' ? 'Video call' : 'Voice call';

    return (
        <div className="call_overlay">
            <div className="call_card">
                <div className="call_header">
                    <div>
                        <h3>{title}</h3>
                        <p>{subtitle}</p>
                    </div>
                </div>

                {callError && <div className="call_error">{callError}</div>}

                <div className="call_media">
                    <audio ref={remoteAudioRef} autoPlay />
                    {callMode === 'video' ? (
                        <>
                            <video ref={remoteVideoRef} className="call_video_remote" autoPlay playsInline />
                            <video ref={localVideoRef} className="call_video_local" autoPlay playsInline muted />
                        </>
                    ) : (
                        <div className="call_audio_only">
                            <Phone size={28} />
                            <span>{callStatus === 'in-call' ? 'Connected' : 'Connecting...'}</span>
                        </div>
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
                        <button type="button" className="call_btn end" onClick={endCall} title="End call">
                            <PhoneOff size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
