import React from 'react';
import './StickerPicker.css';

interface StickerPickerProps {
    onSelect: (stickerId: string) => void;
    onClose: () => void;
}

import { STICKER_PACKS, Sticker } from '../data/stickers';
import { AnimatedSticker } from './AnimatedSticker';

const StickerItem: React.FC<{ sticker: Sticker, onSelect: (id: string) => void }> = ({ sticker, onSelect }) => {
    const [isHovered, setIsHovered] = React.useState(false);
    const videoRef = React.useRef<HTMLVideoElement>(null);

    React.useEffect(() => {
        if (sticker.id.endsWith('.webm') && videoRef.current) {
            if (isHovered) {
                videoRef.current.play().catch(() => { });
            } else {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
            }
        }
    }, [isHovered, sticker.id]);

    return (
        <div
            className="sticker_item"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => onSelect(sticker.id)}
        >
            {(sticker.id.endsWith('.tgs') || sticker.id.endsWith('.json')) ? (
                <AnimatedSticker src={sticker.url} play={isHovered} />
            ) : sticker.id.endsWith('.webm') ? (
                <video
                    ref={videoRef}
                    src={sticker.url}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                />
            ) : (
                <img src={sticker.url} alt={sticker.id} loading="lazy" />
            )}
        </div>
    );
};

export const StickerPicker: React.FC<StickerPickerProps> = ({ onSelect, onClose }) => {
    const [activePackId, setActivePackId] = React.useState(STICKER_PACKS[0].id);
    const activePack = STICKER_PACKS.find(p => p.id === activePackId) || STICKER_PACKS[0];

    const handleSelect = (id: string) => {
        onSelect(id);
        onClose();
    };

    return (
        <div className="sticker_picker_overlay" onClick={onClose}>
            <div className="sticker_picker_content" onClick={e => e.stopPropagation()}>
                <div className="sticker_picker_header">
                    <h4>{activePack.name}</h4>
                    <button className="close_btn" onClick={onClose}>×</button>
                </div>

                <div className="sticker_grid">
                    {activePack.stickers.length > 0 ? (
                        activePack.stickers.map(sticker => (
                            <StickerItem
                                key={sticker.id}
                                sticker={sticker}
                                onSelect={handleSelect}
                            />
                        ))
                    ) : (
                        <div className="empty_pack">Coming soon...</div>
                    )}
                </div>

                <div className="sticker_pack_tabs">
                    {STICKER_PACKS.map(pack => (
                        <button
                            key={pack.id}
                            className={`pack_tab ${activePackId === pack.id ? 'active' : ''}`}
                            onClick={() => setActivePackId(pack.id)}
                            title={pack.name}
                        >
                            {(pack.icon.endsWith('.tgs') || pack.icon.endsWith('.json')) ? (
                                <AnimatedSticker src={pack.icon} className="pack_icon_video" />
                            ) : pack.icon.endsWith('.webm') ? (
                                <video src={pack.icon} autoPlay loop muted playsInline className="pack_icon_video" />
                            ) : (
                                <img src={pack.icon} alt={pack.name} />
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
