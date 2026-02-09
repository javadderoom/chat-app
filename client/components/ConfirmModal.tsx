import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import './ConfirmModal.css';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'danger'
}) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="modal_overlay">
            <div className="modal_content animate-scale">
                <div className="modal_header">
                    <div className="modal_title">
                        <AlertTriangle className={type === 'danger' ? 'text-red-500' : 'text-blue-500'} size={20} />
                        <h3>{title}</h3>
                    </div>
                    <button onClick={onCancel} className="modal_close_btn">
                        <X size={20} />
                    </button>
                </div>
                <div className="modal_body">
                    <p>{message}</p>
                </div>
                <div className="modal_footer">
                    <button onClick={onCancel} className="btn_secondary">
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`btn_primary ${type === 'danger' ? 'danger' : ''}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
