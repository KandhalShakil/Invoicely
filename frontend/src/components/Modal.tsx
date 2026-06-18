import React, { useEffect, useRef } from 'react';
import { useModal } from '../context/ModalContext';
import { AlertCircle, CheckCircle, Info, AlertTriangle, Trash2, X } from 'lucide-react';

const Modal: React.FC = () => {
  const { isOpen, modalOptions, hideModal } = useModal();
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        hideModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hideModal]);

  // Focus trap & auto-focus confirm button
  useEffect(() => {
    if (isOpen && confirmBtnRef.current) {
      setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const [isSubmitting, setIsSubmitting] = React.useState(false);

  if (!isOpen && !modalOptions) return null;

  const {
    type = 'info',
    title = '',
    message = '',
    confirmText = 'OK',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
  } = modalOptions || {};

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      if (onConfirm) {
        await onConfirm();
      }
      hideModal();
    } catch (error) {
      console.error('Confirmation action failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (isSubmitting) return;
    if (onCancel) {
      onCancel();
    }
    hideModal();
  };

  const getIcon = () => {
    switch (type) {
      case 'confirm':
        return <Trash2 className="w-6 h-6 text-red-400" />;
      case 'success':
        return <CheckCircle className="w-6 h-6 text-emerald-400" />;
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-amber-400" />;
      case 'info':
      default:
        return <Info className="w-6 h-6 text-blue-400" />;
    }
  };

  const getIconBg = () => {
    switch (type) {
      case 'confirm':
      case 'error':
        return 'bg-red-500/10 border-red-500/20';
      case 'success':
        return 'bg-emerald-500/10 border-emerald-500/20';
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/20';
      case 'info':
      default:
        return 'bg-blue-500/10 border-blue-500/20';
    }
  };

  const getConfirmBtnColor = () => {
    switch (type) {
      case 'confirm':
      case 'error':
        return 'bg-red-500 hover:bg-red-600 text-white';
      case 'success':
        return 'bg-emerald-500 hover:bg-emerald-600 text-white';
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-600 text-white';
      case 'info':
      default:
        return 'bg-blue-500 hover:bg-blue-600 text-white';
    }
  };

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    >
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-[#070a13]/80 backdrop-blur-sm ${isSubmitting ? 'cursor-not-allowed' : ''}`}
        onClick={handleCancel}
      />

      {/* Modal Dialog */}
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative w-full max-w-md transform overflow-hidden rounded-xl bg-[#13182b] border border-gray-800 shadow-2xl transition-all duration-300 ${isOpen ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'}`}
      >
        {/* Close Button */}
        <button 
          onClick={handleCancel}
          className="absolute right-4 top-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <div className="flex items-start">
            {/* Icon */}
            <div className={`flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full border ${getIconBg()}`}>
              {getIcon()}
            </div>
            
            {/* Content */}
            <div className="ml-4 mt-1">
              <h3 id="modal-title" className="text-lg font-medium text-white">
                {title}
              </h3>
              <p className="mt-2 text-sm text-gray-400 leading-relaxed">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="bg-[#0b0e17] px-6 py-4 flex items-center justify-end space-x-3 border-t border-gray-800/60">
          {(type === 'confirm' || type === 'warning') && (
            <button
              onClick={handleCancel}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-transparent border border-gray-700 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0b0e17] focus:ring-gray-600"
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0b0e17] shadow-lg flex items-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed bg-gray-600 hover:bg-gray-600' : getConfirmBtnColor()}`}
          >
            {isSubmitting && (
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;
