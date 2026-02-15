import React, { useRef, useState } from 'react';
import { Plus, Image, Video, Music, X, Loader2 } from 'lucide-react';

interface FileUploadButtonProps {
    serverUrl: string;
    token: string | null;
    disabled?: boolean;
    onUploadComplete: (uploadData: UploadResult) => void;
    onError: (error: string) => void;
}

export interface UploadResult {
    messageType: 'image' | 'video' | 'audio';
    mediaUrl: string;
    mediaType: string;
    fileName: string;
    fileSize: number;
    mediaDuration?: number;
}

const ACCEPTED_TYPES = {
    image: 'image/jpeg,image/png,image/gif,image/webp',
    video: 'video/mp4,video/webm,video/quicktime',
    audio: 'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm',
};

const MAX_SIZES = {
    image: 10 * 1024 * 1024,  // 10MB
    video: 100 * 1024 * 1024, // 100MB
    audio: 40 * 1024 * 1024,  // 40MB
};

export const FileUploadButton: React.FC<FileUploadButtonProps> = ({
    serverUrl,
    token,
    disabled = false,
    onUploadComplete,
    onError,
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const currentTypeRef = useRef<'image' | 'video' | 'audio'>('image');

    const handleFileSelect = (type: 'image' | 'video' | 'audio') => {
        currentTypeRef.current = type;
        if (fileInputRef.current) {
            fileInputRef.current.accept = ACCEPTED_TYPES[type];
            fileInputRef.current.click();
        }
        setIsMenuOpen(false);
    };

    const uploadFile = async (file: File, type: 'image' | 'video' | 'audio') => {
        // Validate file size
        if (file.size > MAX_SIZES[type]) {
            const maxMB = MAX_SIZES[type] / (1024 * 1024);
            onError(`File too large. Maximum size for ${type} is ${maxMB}MB`);
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const xhr = new XMLHttpRequest();

            // Track upload progress
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const progress = Math.round((e.loaded / e.total) * 100);
                    setUploadProgress(progress);
                }
            });

            // Create promise for XHR
            const response = await new Promise<UploadResult>((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            if (data.success) {
                                resolve(data as UploadResult);
                            } else {
                                reject(new Error(data.error || 'Upload failed'));
                            }
                        } catch {
                            reject(new Error('Invalid server response'));
                        }
                    } else {
                        try {
                            const errorData = JSON.parse(xhr.responseText);
                            reject(new Error(errorData.error || `Upload failed: ${xhr.status}`));
                        } catch {
                            reject(new Error(`Upload failed: ${xhr.status}`));
                        }
                    }
                };
                xhr.onerror = () => reject(new Error('Network error'));
                xhr.open('POST', `${serverUrl}/api/upload/${type}`);
                if (token) {
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                }
                xhr.send(formData);
            });

            onUploadComplete(response);
        } catch (error) {
            onError(error instanceof Error ? error.message : 'Upload failed');
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await uploadFile(file, currentTypeRef.current);
        }
        // Reset input so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="file_upload_container relative">
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                disabled={disabled || isUploading}
            />

            {/* Upload button */}
            <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                disabled={disabled || isUploading}
                className="upload_button"
            >
                {isUploading ? (
                    <Loader2 size={20} className="animate-spin" />
                ) : (
                    <Plus size={20} />
                )}
            </button>

            {/* Upload progress indicator */}
            {isUploading && (
                <div className="upload_progress absolute">
                    {uploadProgress}%
                </div>
            )}

            {/* Dropdown menu */}
            {isMenuOpen && !isUploading && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-30"
                        onClick={() => setIsMenuOpen(false)}
                    />

                    {/* Menu */}
                    <div className="upload_menu absolute z-40">
                        <button
                            type="button"
                            onClick={() => handleFileSelect('image')}
                            className="upload_option"
                        >
                            <Image size={18} className="text-green-400" />
                            <span>Image</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleFileSelect('video')}
                            className="upload_option"
                        >
                            <Video size={18} className="text-blue-400" />
                            <span>Video</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleFileSelect('audio')}
                            className="upload_option"
                        >
                            <Music size={18} className="text-purple-400" />
                            <span>Audio</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default FileUploadButton;
