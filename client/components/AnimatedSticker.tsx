import React, { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import pako from 'pako';

interface AnimatedStickerProps {
    src: string;
    className?: string;
    play?: boolean;
}

export const AnimatedSticker: React.FC<AnimatedStickerProps> = ({ src, className, play = true }) => {
    const [animationData, setAnimationData] = useState<any>(null);
    const [error, setError] = useState<boolean>(false);

    useEffect(() => {
        const fetchAnimation = async () => {
            try {
                const response = await fetch(src);
                if (!response.ok) throw new Error('Failed to fetch sticker');

                const isTgs = src.toLowerCase().endsWith('.tgs');

                if (isTgs) {
                    const arrayBuffer = await response.arrayBuffer();
                    // .tgs files are gzipped JSON Lottie files
                    const decompressed = pako.ungzip(new Uint8Array(arrayBuffer), { to: 'string' });
                    setAnimationData(JSON.parse(decompressed));
                } else {
                    // Regular .json Lottie file
                    const data = await response.json();
                    setAnimationData(data);
                }
            } catch (err) {
                console.error('Error loading animated sticker:', err);
                setError(true);
            }
        };

        fetchAnimation();
    }, [src]);

    if (error) {
        return <div className={`sticker_error ${className}`}>⚠️</div>;
    }

    if (!animationData) {
        return <div className={`sticker_loader ${className}`}></div>;
    }

    return (
        <div className={className}>
            <Lottie
                animationData={animationData}
                loop={true}
                autoplay={play}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
};
