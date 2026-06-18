import React, { useState, useEffect } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { fetcher } from '../utils/fetcher';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { Plus, Edit2, Trash2, Box, Package, Check, X } from 'lucide-react';
import { Product } from '../types';

const Products: React.FC = () => {
  const { activeOrg, activeRole } = useAuth();
  const { showModal } = useModal();
  const cacheKey = activeOrg ? '/products/' : null;
  const { data: fetchResult, error: swrError, mutate: boundMutate } = useSWR(cacheKey, fetcher);
  
  const products: Product[] = fetchResult?.results || fetchResult || [];
  const isLoading = !fetchResult && !swrError;

  useEffect(() => {
    const handleSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      
      if (detail.model === 'product') {
        globalMutate(key => typeof key === 'string' && key.startsWith('/products/'));
      }
    };
    window.addEventListener('app:sync', handleSync);
    return () => window.removeEventListener('app:sync', handleSync);
  }, []);

  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [taxRate, setTaxRate] = useState('18.00');
  const [hsnSacCode, setHsnSacCode] = useState('');
  const [type, setType] = useState<'product' | 'service'>('product');
  const [inventoryCount, setInventoryCount] = useState('0');
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setEditId(null);
    setName('');
    setSku('');
    setDescription('');
    setPrice('');
    setTaxRate('18.00');
    setHsnSacCode('');
    setType('product');
    setInventoryCount('0');
    setError('');
    setFormErrors({});
  };

  const handleEditInit = (prod: Product) => {
    setEditId(prod.id);
    setName(prod.name);
    setSku(prod.sku);
    setDescription(prod.description || '');
    setPrice(prod.price.toString());
    setTaxRate(prod.tax_rate.toString());
    setHsnSacCode(prod.hsn_sac_code || '');
    setType(prod.type);
    setInventoryCount(prod.inventory_count.toString());
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFormErrors({});

    // Client-side validations
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Item name is required.";
    if (!price || parseFloat(price) <= 0) errors.price = "Price must be greater than zero.";
    if (type === 'product' && (!inventoryCount || parseInt(inventoryCount) < 0)) {
      errors.inventory_count = "Stock count cannot be negative.";
    }
    if (products.some(p => p.name.toLowerCase() === name.trim().toLowerCase() && p.id !== editId)) {
      errors.name = "Item name already exists.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      const firstInvalidKey = Object.keys(errors)[0];
      const el = document.getElementById(`prod_${firstInvalidKey}`);
      if (el) el.focus();
      return;
    }

    const payload = {
      name: name.trim(),
      description,
      price: parseFloat(price),
      tax_rate: parseFloat(taxRate) || 0.00,
      hsn_sac_code: hsnSacCode,
      type,
      inventory_count: type === 'product' ? parseInt(inventoryCount) : 0,
      is_active: true
    };

    setIsSubmitting(true);
    
    // API Pre-Validation
    try {
      await api.post('/products/validate/', { ...payload, id: editId || undefined });
    } catch (err: any) {
      handleError(err);
      setIsSubmitting(false);
      return;
    }

    setIsOpen(false); // Optimistic close ONLY after validation passes

    if (editId) {
      const optimisticProducts = products.map(p => p.id === editId ? { ...p, ...payload, _status: 'saving' as const } : p);
      const optimisticResult = fetchResult?.results ? { ...fetchResult, results: optimisticProducts } : optimisticProducts;
      
      try {
        await boundMutate(
          api.put(`/products/${editId}/`, payload).then(() => fetcher(cacheKey as string)),
          { optimisticData: optimisticResult, rollbackOnError: true, populateCache: true, revalidate: false }
        );
        showToast('Item updated successfully.', 'success');
        resetForm();
      } catch (err: any) {
        setIsOpen(true);
        handleError(err);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const tempId = `temp_${Date.now()}`;
      const tempProd = { id: tempId, ...payload, organization_id: activeOrg, _status: 'saving' as const, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sku: 'Generating...' };
      const optimisticProducts = [tempProd, ...products];
      const optimisticResult = fetchResult?.results ? { ...fetchResult, results: optimisticProducts } : optimisticProducts;

      try {
        await boundMutate(
          api.post('/products/', payload).then(() => fetcher(cacheKey as string)),
          { optimisticData: optimisticResult, rollbackOnError: true, populateCache: true, revalidate: false }
        );
        showToast('Item created successfully.', 'success');
        resetForm();
      } catch (err: any) {
        setIsOpen(true);
        handleError(err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleError = (err: any) => {
    if (err.response && err.response.status === 400 && typeof err.response.data === 'object') {
      const data = err.response.data;
      const fieldErrors: Record<string, string> = {};
      Object.keys(data).forEach((key) => {
        const val = data[key];
        fieldErrors[key] = Array.isArray(val) ? val[0] : val;
      });
      setFormErrors(fieldErrors);
      showToast('Please correct the highlighted errors. Changes rolled back.', 'error');
    } else {
      let msg = err.response?.data?.error || 'Unable to save changes. Changes have been reverted.';
      if (typeof msg === 'object') msg = msg.message || JSON.stringify(msg);
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    showModal({
      type: 'confirm',
      title: 'Delete Catalog Item',
      message: 'Are you sure you want to delete this catalog item? This action cannot be undone.',
      confirmText: 'Delete',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          const optimisticProducts = products.filter(p => p.id !== id);
          const optimisticResult = fetchResult?.results ? { ...fetchResult, results: optimisticProducts } : optimisticProducts;

          await boundMutate(
            api.delete(`/products/${id}/`).then(() => optimisticResult),
            { optimisticData: optimisticResult, rollbackOnError: true, populateCache: true, revalidate: false }
          );
          showToast('Catalog item deleted successfully!', 'success');
        } catch (e: any) {
          const msg = e.response?.data?.error || e.response?.data?.detail || "Failed to delete product. It may be referenced in line items.";
          showToast(msg, 'error');
          throw e;
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  };

  const isViewer = activeRole === 'viewer';

  const renderSkeletons = () => (
    <div className="glass rounded-2xl border border-slate-800/80 overflow-hidden animate-pulse">
      <div className="h-10 bg-slate-900/20 border-b border-slate-800"></div>
      <div className="divide-y divide-slate-800/40">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 w-1/3">
              <div className="w-8 h-8 bg-slate-850 rounded"></div>
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-slate-850 rounded w-3/4"></div>
                <div className="h-3 bg-slate-850/60 rounded w-1/2"></div>
              </div>
            </div>
            <div className="h-4 bg-slate-850 rounded w-16"></div>
            <div className="h-4 bg-slate-850 rounded w-12"></div>
            <div className="h-4 bg-slate-850 rounded w-20"></div>
            <div className="h-4 bg-slate-850 rounded w-12"></div>
            <div className="h-4 bg-slate-850 rounded w-16"></div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold font-display text-gradient">Products & Services</h2>
          <p className="text-slate-500 text-xs mt-1">Configure pricing rates, unique SKUs, HSN codes, and inventory levels</p>
        </div>
        {!isViewer && (
          <button
            onClick={() => { resetForm(); setIsOpen(true); }}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all glow-emerald"
          >
            <Plus className="w-4 h-4" /> Add Catalog Item
          </button>
        )}
      </div>

      {isLoading ? (
        renderSkeletons()
      ) : (
        /* Catalog Table */
        <div className="glass rounded-2xl border border-slate-800/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/20">
                  <th className="p-4 font-semibold">Details</th>
                  <th className="p-4 font-semibold">SKU</th>
                  <th className="p-4 font-semibold">Type</th>
                  <th className="p-4 font-semibold">Unit Price</th>
                  <th className="p-4 font-semibold">Tax Rate</th>
                  <th className="p-4 font-semibold">HSN / SAC</th>
                  <th className="p-4 font-semibold">Stock Level</th>
                  {!isViewer && <th className="p-4 font-semibold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {products.map((prod) => (
                  <tr key={prod.id} className={`hover:bg-slate-800/10 transition-colors ${prod._status === 'saving' ? 'opacity-60' : ''}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                          {prod.type === 'product' ? <Package className="w-4 h-4 text-emerald-400" /> : <Box className="w-4 h-4 text-sky-400" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-200">{prod.name}</p>
                            {prod._status === 'saving' && (
                              <span className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded font-bold animate-pulse">
                                Saving...
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 line-clamp-1">{prod.description || 'No description'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-slate-400">{prod.sku}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                        prod.type === 'product' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-sky-500/10 text-sky-400'
                      }`}>
                        {prod.type}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-300">
                      ₹ {prod.price.toLocaleString()}
                    </td>
                    <td className="p-4 text-slate-400">{prod.tax_rate}%</td>
                    <td className="p-4 text-slate-400">{prod.hsn_sac_code || '-'}</td>
                    <td className="p-4">
                      {prod.type === 'product' ? (
                        <span className={`font-semibold ${prod.inventory_count <= 5 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {prod.inventory_count} Units
                        </span>
                      ) : (
                        <span className="text-slate-600 italic">Unlimited</span>
                      )}
                    </td>
                    {!isViewer && (
                      <td className="p-4 text-right">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => handleEditInit(prod)} disabled={prod._status === 'saving'} className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg transition-colors disabled:opacity-50">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(prod.id)} disabled={prod._status === 'saving'} className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg transition-colors disabled:opacity-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No catalog items registered. Add your first item above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Editor Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg glass border border-slate-800 rounded-2xl shadow-2xl p-6">
            <h3 className="font-bold text-lg font-display text-slate-200 mb-6">
              {editId ? 'Edit Catalog Item' : 'Add Catalog Item'}
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-500/20 text-red-300 text-xs rounded-lg text-center font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Item Type</label>
                  <select
                    id="prod_type"
                    value={type}
                    onChange={(e) => setType(e.target.value as 'product' | 'service')}
                    className="w-full bg-[#111827] border border-slate-800 text-slate-200 py-2 px-3 rounded-lg focus:outline-none focus:border-emerald-500"
                  >
                    <option value="product">Physical Product</option>
                    <option value="service">Billed Service</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">SKU / Unique Identifier</label>
                  <input
                    type="text"
                    id="prod_sku"
                    value={editId ? sku : ''}
                    placeholder="Auto-generated"
                    readOnly
                    disabled
                    className="w-full bg-[#111827] border border-slate-800 text-slate-500 py-2 px-3 rounded-lg focus:outline-none cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Item Title / Name</label>
                <input
                  type="text"
                  id="prod_name"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setFormErrors(prev => ({ ...prev, name: '' }));
                  }}
                  className={`w-full bg-[#111827] border text-slate-200 py-2 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                    formErrors.name ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                  }`}
                  placeholder="Website Migration Services"
                />
                {formErrors.name && (
                  <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.name}</span>
                )}
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Description</label>
                <textarea
                  id="prod_description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-[#111827] border border-slate-800 text-slate-200 py-1.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500"
                  placeholder="Details of the product or service..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Unit Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    id="prod_price"
                    required
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value);
                      setFormErrors(prev => ({ ...prev, price: '' }));
                    }}
                    className={`w-full bg-[#111827] border text-slate-200 py-2 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                      formErrors.price ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                    }`}
                    placeholder="150.00"
                  />
                  {formErrors.price && (
                    <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.price}</span>
                  )}
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Tax Percentage (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    id="prod_tax_rate"
                    required
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full bg-[#111827] border border-slate-800 text-slate-200 py-2 px-3 rounded-lg focus:outline-none focus:border-emerald-500"
                    placeholder="18.00"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">HSN / SAC Code</label>
                  <input
                    type="text"
                    id="prod_hsn_sac_code"
                    value={hsnSacCode || ''}
                    placeholder="Auto-generated"
                    readOnly
                    disabled
                    className="w-full bg-[#111827] border border-slate-800 text-slate-500 py-2 px-3 rounded-lg focus:outline-none cursor-not-allowed"
                  />
                </div>
              </div>

              {type === 'product' && (
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Initial Stock Count</label>
                  <input
                    type="number"
                    id="prod_inventory_count"
                    required
                    value={inventoryCount}
                    onChange={(e) => {
                      setInventoryCount(e.target.value);
                      setFormErrors(prev => ({ ...prev, inventory_count: '' }));
                    }}
                    className={`w-full bg-[#111827] border text-slate-200 py-2 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                      formErrors.inventory_count ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                    }`}
                    placeholder="50"
                  />
                  {formErrors.inventory_count && (
                    <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.inventory_count}</span>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); resetForm(); }}
                  disabled={isSubmitting}
                  className="bg-transparent border border-slate-800 hover:bg-slate-800/40 text-slate-300 font-semibold py-2 px-4 rounded-xl disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-5 rounded-xl transition-all glow-emerald disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : (editId ? 'Save Changes' : 'Create Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2 animate-bounce ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-400' 
            : 'bg-rose-950/90 border-rose-500/30 text-rose-400'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default Products;
