import React, { useState, useRef } from 'react';
import { Upload, X, QrCode, Link as LinkIcon, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Organization } from '../types';

interface PaymentSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedOrg: Organization) => void;
  preventClose?: boolean;
}

const PaymentSetupModal: React.FC<PaymentSetupModalProps> = ({ isOpen, onClose, onSuccess, preventClose = false }) => {
  const { activeOrg, organizations } = useAuth();
  const [activeTab, setActiveTab] = useState<'upi' | 'qr'>('upi');
  const [upiId, setUpiId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentOrg = activeOrg;

  const handleTabChange = (tab: 'upi' | 'qr') => {
    setActiveTab(tab);
    setError('');
    setSuccess('');
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setQrFile(file);
      setQrPreview(URL.createObjectURL(file));
      setError('');
    }
  };

  const handleSubmitUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upiId) return setError('UPI ID is required');
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const res = await api.post(`/organizations/${activeOrg?.id}/payment-setup/upi/`, {
        upi_id: upiId,
        merchant_name: merchantName || currentOrg?.name
      });
      setSuccess('UPI ID configured successfully!');
      setTimeout(() => {
        if (currentOrg) {
          onSuccess({
            ...currentOrg,
            payment_upi_id: res.data.payment_upi_id,
            payment_merchant_name: res.data.payment_merchant_name,
            payment_qr_code: res.data.payment_qr_code
          });
        }
        if (!preventClose) onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to configure UPI ID.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitQr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrFile) return setError('Please upload a QR code image.');
    
    setIsSubmitting(true);
    setError('');
    
    const formData = new FormData();
    formData.append('qr_image', qrFile);
    
    try {
      const res = await api.post(`/organizations/${activeOrg?.id}/payment-setup/qr/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSuccess(`QR decoded successfully! UPI ID: ${res.data.extracted_upi}`);
      setTimeout(() => {
        if (currentOrg) {
          onSuccess({
            ...currentOrg,
            payment_upi_id: res.data.extracted_upi,
            payment_merchant_name: res.data.extracted_merchant,
            payment_qr_code: res.data.payment_qr_code
          });
        }
        if (!preventClose) onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to process QR code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
      <div className="bg-[#0f1423] border border-slate-700/60 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in-up">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-400" />
              Setup Payment Collection
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              A valid payment method is required to generate invoices.
            </p>
          </div>
          {!preventClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-[#161f30]">
          <button
            onClick={() => handleTabChange('upi')}
            className={`flex-1 py-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${activeTab === 'upi' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
          >
            <LinkIcon className="w-4 h-4" /> Enter UPI ID
          </button>
          <button
            onClick={() => handleTabChange('qr')}
            className={`flex-1 py-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${activeTab === 'qr' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
          >
            <Upload className="w-4 h-4" /> Upload Existing QR
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {error && (
            <div className="mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mb-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-lg flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{success}</p>
            </div>
          )}

          {activeTab === 'upi' ? (
            <form onSubmit={handleSubmitUpi} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">UPI ID *</label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value.toLowerCase())}
                  placeholder="e.g. shop@paytm"
                  className="w-full bg-[#1e293b] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                  required
                />
                <p className="text-xs text-slate-500 mt-2">Must be a valid VPA (no spaces). We'll automatically generate a clean QR code from this.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Merchant Name (Optional)</label>
                <input
                  type="text"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder={`Default: ${currentOrg?.name}`}
                  className="w-full bg-[#1e293b] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !upiId}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</> : 'Save Payment Details'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmitQr} className="space-y-5">
              <div 
                className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/5 transition-all"
                onClick={() => fileInputRef.current?.click()}
              >
                {qrPreview ? (
                  <div className="flex flex-col items-center">
                    <img src={qrPreview} alt="QR Preview" className="w-32 h-32 object-contain mb-4 rounded-lg bg-white p-2" />
                    <p className="text-sm font-medium text-emerald-400">Click to change image</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-[#1e293b] rounded-full flex items-center justify-center mb-4">
                      <QrCode className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-base font-bold text-slate-300 mb-1">Click to Upload QR</h3>
                    <p className="text-xs text-slate-500">Supports PNG, JPG, JPEG</p>
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleQrUpload}
                  accept="image/png, image/jpeg, image/jpg"
                  className="hidden"
                />
              </div>
              
              <div className="bg-[#1e293b] rounded-lg p-4 text-xs text-slate-400 space-y-2">
                <p className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> We will extract your exact UPI ID.</p>
                <p className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> A brand new clean, high-res QR code will be generated.</p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !qrFile}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Decoding Image...</> : 'Process QR Code'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentSetupModal;
