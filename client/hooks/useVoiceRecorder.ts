import { useState, useRef, useCallback } from 'react';

interface UseVoiceRecorderProps {
    onRecordingComplete: (file: File) => void;
    onError: (error: string) => void;
}

export const useVoiceRecorder = ({ onRecordingComplete, onError }: UseVoiceRecorderProps) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const file = new File([blob], `voice_message_${Date.now()}.webm`, { type: 'audio/webm' });
                onRecordingComplete(file);

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);

            // Start timer
            setRecordingDuration(0);
            timerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error('Error starting recording:', err);
            onError('Could not access microphone. Please check permissions.');
        }
    }, [onRecordingComplete, onError]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);

            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    }, [isRecording]);

    const cancelRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            // Remove onstop handler so we don't trigger completion
            mediaRecorderRef.current.onstop = null;
            mediaRecorderRef.current.stop();

            // Stop all tracks
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

            setIsRecording(false);

            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    }, [isRecording]);

    return {
        isRecording,
        recordingDuration,
        startRecording,
        stopRecording,
        cancelRecording
    };
};
