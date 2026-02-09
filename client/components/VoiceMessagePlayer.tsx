import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface VoiceMessagePlayerProps {
    src: string;
    duration?: number;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({ src, duration }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(duration || 0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const onTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const onLoadedMetadata = () => {
        if (audioRef.current && !duration) {
            setTotalDuration(audioRef.current.duration);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            const handleEnded = () => {
                setIsPlaying(false);
                setCurrentTime(0);
            };
            audio.addEventListener('ended', handleEnded);
            return () => audio.removeEventListener('ended', handleEnded);
        }
    }, []);

    return (
        <div className="voice_player">
            <audio
                ref={audioRef}
                src={src}
                onTimeUpdate={onTimeUpdate}
                onLoadedMetadata={onLoadedMetadata}
            />

            <button
                type="button"
                className="voice_play_button"
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
            >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>

            <div className="voice_controls">
                <input
                    type="range"
                    min="0"
                    max={totalDuration || 0}
                    step="0.1"
                    value={currentTime}
                    onChange={handleSeek}
                    className="voice_seekbar"
                />
                <div className="voice_timer">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(totalDuration)}</span>
                </div>
            </div>
        </div>
    );
};
