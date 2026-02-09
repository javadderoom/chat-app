import React from 'react';
import './StickerPicker.css';

interface StickerPickerProps {
    onSelect: (stickerId: string) => void;
    onClose: () => void;
}

const STICKERS = [
    { id: 'dog_happy', url: '/stickers/dog_happy.svg' },
    { id: 'cat_cool', url: '/stickers/cat_cool.svg' },
    { id: 'rabbit_surprised', url: '/stickers/rabbit_surprised.svg' },
    { id: 'bear_sleepy', url: '/stickers/bear_sleepy.svg' },
    { id: 'fox_wink', url: '/stickers/fox_wink.svg' },
    { id: 'owl_smart', url: '/stickers/owl_smart.svg' },
];

export const StickerPicker: React.FC<StickerPickerProps> = ({ onSelect, onClose }) => {
    return (
        <div className="sticker_picker_overlay" onClick={onClose}>
            <div className="sticker_picker_content" onClick={e => e.stopPropagation()}>
                <div className="sticker_picker_header">
                    <h4>Stickers</h4>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="sticker_grid">
                    {STICKERS.map(sticker => (
                        <div
                            key={sticker.id}
                            className="sticker_item"
                            onClick={() => { onSelect(sticker.id); onClose(); }}
                        >
                            <img src={sticker.url} alt={sticker.id} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
