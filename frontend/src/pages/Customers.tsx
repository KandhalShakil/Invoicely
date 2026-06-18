import React, { useState, useEffect } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { fetcher } from '../utils/fetcher';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { Plus, Edit2, Trash2, Search, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { Customer } from '../types';
import { validatePhone, validateEmail } from '../utils/validation';


const Customers: React.FC = () => {
  const { activeOrg, activeRole } = useAuth();
  const { showModal } = useModal();
  
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const cacheKey = activeOrg ? `/customers/?page=${page}&search=${debouncedSearch}` : null;
  const { data: fetchResult, error: swrError, mutate: boundMutate } = useSWR(cacheKey, fetcher);
  
  const customers: Customer[] = fetchResult?.results || fetchResult || [];
  const totalCount = fetchResult?.count || customers.length;
  const isLoading = !fetchResult && !swrError;

  // Real-time synchronization cache invalidation
  useEffect(() => {
    const handleSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (detail.model === 'customer') {
        globalMutate(key => typeof key === 'string' && key.startsWith('/customers/'));
      }
    };
    window.addEventListener('app:sync', handleSync);
    return () => window.removeEventListener('app:sync', handleSync);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [billingStreet, setBillingStreet] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingCountry, setBillingCountry] = useState('India');
  const [billingZip, setBillingZip] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setEditId(null);
    setContactName('');
    setEmail('');
    setPhone('');
    setBillingStreet('');
    setBillingCity('');
    setBillingState('');
    setBillingCountry('India');
    setBillingZip('');
    setNotes('');
    setTags('');
    setError('');
    setFormErrors({});
  };

  const handleEditInit = (cust: Customer) => {
    setEditId(cust.id);
    setContactName(cust.contact_name);
    setEmail(cust.email);
    setPhone(cust.phone || '');
    setBillingStreet(cust.billing_address?.street || '');
    setBillingCity(cust.billing_address?.city || '');
    setBillingState(cust.billing_address?.state || '');
    setBillingCountry(cust.billing_address?.country || 'India');
    setBillingZip(cust.billing_address?.zip || '');
    setNotes(cust.notes || '');
    setTags(cust.tags?.join(', ') || '');
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFormErrors({});

    // Client-side validations
    const errors: Record<string, string> = {};
    if (!contactName.trim()) errors.contact_name = "Customer name is required.";
    if (!email.trim()) {
      errors.email = "Email address is required.";
    } else if (!validateEmail(email.trim())) {
      errors.email = "Email address is invalid.";
    }
    if (!phone.trim()) {
      errors.phone = "Phone number is required.";
    } else if (!validatePhone(phone.trim())) {
      errors.phone = "Phone number must contain exactly 10 digits.";
    }
    if (!billingStreet.trim()) errors.billing_street = "Street address is required.";
    if (!billingCity.trim()) errors.billing_city = "City is required.";
    if (!billingState.trim()) errors.billing_state = "State is required.";
    if (!billingZip.trim()) errors.billing_zip = "ZIP code is required.";

    if (customers.some(c => c.email.toLowerCase() === email.trim().toLowerCase() && c.id !== editId)) {
      errors.email = "Email address already exists.";
    }
    if (customers.some(c => c.phone === phone.trim() && c.id !== editId)) {
      errors.phone = "Phone number already exists.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      const firstInvalidKey = Object.keys(errors)[0];
      const el = document.getElementById(`cust_${firstInvalidKey}`);
      if (el) el.focus();
      return;
    }
    
    const billing_address = {
      street: billingStreet.trim(),
      city: billingCity.trim(),
      state: billingState.trim(),
      country: billingCountry.trim(),
      zip: billingZip.trim()
    };

    const payload = {
      contact_name: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      billing_address,
      shipping_address: billing_address,
      notes,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []
    };

    setIsSubmitting(true);
    
    // API Pre-Validation
    try {
      await api.post('/customers/validate/', { ...payload, id: editId || undefined });
    } catch (err: any) {
      handleError(err);
      setIsSubmitting(false);
      return;
    }

    setIsOpen(false); // Optimistically close modal instantly AFTER validation passes

    if (editId) {
      const optimisticCustomers = customers.map(c => c.id === editId ? { ...c, ...payload, _status: 'saving' as const } : c);
      const optimisticResult = fetchResult?.results ? { ...fetchResult, results: optimisticCustomers } : optimisticCustomers;
      
      try {
        await boundMutate(
          api.put(`/customers/${editId}/`, payload).then(() => fetcher(cacheKey as string)),
          { optimisticData: optimisticResult, rollbackOnError: true, populateCache: true, revalidate: false }
        );
        showToast('Customer updated successfully.', 'success');
        resetForm();
      } catch (err: any) {
        setIsOpen(true); // Re-open modal on rollback error
        handleError(err);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const tempId = `temp_${Date.now()}`;
      const tempCust = { id: tempId, ...payload, organization_id: activeOrg, _status: 'saving' as const, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const optimisticCustomers = [tempCust, ...customers];
      const optimisticResult = fetchResult?.results ? { ...fetchResult, count: totalCount + 1, results: optimisticCustomers } : optimisticCustomers;

      try {
        await boundMutate(
          api.post('/customers/', payload).then(() => fetcher(cacheKey as string)),
          { optimisticData: optimisticResult, rollbackOnError: true, populateCache: true, revalidate: false }
        );
        showToast('Customer added successfully.', 'success');
        resetForm();
      } catch (err: any) {
        setIsOpen(true); // Re-open modal on rollback error
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
        if (key === 'billing_address' && typeof val === 'object') {
          Object.keys(val).forEach((addressKey) => {
            const addressVal = val[addressKey];
            fieldErrors[`billing_${addressKey}`] = Array.isArray(addressVal) ? addressVal[0] : addressVal;
          });
        } else {
          fieldErrors[key] = Array.isArray(val) ? val[0] : val;
        }
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
      title: 'Delete Customer',
      message: 'Are you sure you want to delete this customer? This action cannot be undone.',
      confirmText: 'Delete',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          const optimisticCustomers = customers.filter(c => c.id !== id);
          const optimisticResult = fetchResult?.results ? { ...fetchResult, count: Math.max(0, totalCount - 1), results: optimisticCustomers } : optimisticCustomers;
          
          await boundMutate(
            api.delete(`/customers/${id}/`).then(() => optimisticResult),
            { optimisticData: optimisticResult, rollbackOnError: true, populateCache: true, revalidate: false }
          );
          showToast('Customer deleted successfully!', 'success');
        } catch (e: any) {
          const msg = e.response?.data?.error || e.response?.data?.detail || "Failed to delete customer. They may have active invoices.";
          showToast(msg, 'error');
          throw e;
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  };

  const isViewer = activeRole === 'viewer' || activeRole === 'employee';
  const pageSize = 20;
  const totalPages = Math.ceil(totalCount / pageSize);

  const renderSkeletons = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="glass p-6 rounded-2xl border border-slate-800/80 flex flex-col justify-between animate-pulse">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-2 w-3/4">
                <div className="h-5 bg-slate-850 rounded w-5/6"></div>
                <div className="h-3 bg-slate-850/60 rounded w-1/2"></div>
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <div className="h-3 bg-slate-850/60 rounded w-full"></div>
              <div className="h-3 bg-slate-850/60 rounded w-5/6"></div>
              <div className="h-3 bg-slate-850/60 rounded w-2/3"></div>
            </div>
          </div>
          <div className="border-t border-slate-800/60 mt-6 pt-4 flex gap-1.5">
            <div className="h-4 bg-slate-850/80 rounded w-12"></div>
            <div className="h-4 bg-slate-850/80 rounded w-16"></div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold font-display text-gradient">Customers</h2>
          <p className="text-slate-500 text-xs mt-1">Directory of client contacts, profiles, and billing details</p>
        </div>
        {!isViewer && (
          <button
            onClick={() => { resetForm(); setIsOpen(true); }}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all glow-emerald"
          >
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="text"
          placeholder="Search by name, email, or phone number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#111827] border border-slate-800 text-slate-200 text-xs py-3 pl-10 pr-4 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors"
        />
      </div>

      {/* Grid listing / Skeletons */}
      {isLoading ? (
        renderSkeletons()
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {customers.map((cust) => (
              <div key={cust.id} className={`glass p-6 rounded-2xl border border-slate-800/80 flex flex-col justify-between glass-hover ${cust._status === 'saving' ? 'opacity-60' : ''}`}>
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base font-display text-slate-100">{cust.contact_name}</h3>
                        {cust._status === 'saving' && (
                          <span className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded font-bold animate-pulse">
                            Saving...
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold">{cust.email}</span>
                    </div>
                    {!isViewer && (
                      <div className="flex gap-2">
                        <button onClick={() => handleEditInit(cust)} disabled={cust._status === 'saving'} className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg transition-colors disabled:opacity-50">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(cust.id)} disabled={cust._status === 'saving'} className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg transition-colors disabled:opacity-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-400">
                    <p>Phone: <span className="text-slate-300 font-medium">{cust.phone}</span></p>
                    <p className="line-clamp-2">
                      Address:{' '}
                      <span className="text-slate-300">
                        {cust.billing_address?.street ? `${cust.billing_address.street}, ${cust.billing_address.city}` : 'No address specified'}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Tags & notes summary */}
                <div className="border-t border-slate-800/60 mt-4 pt-4 flex flex-wrap gap-1.5">
                  {cust.tags.map((tag) => (
                    <span key={tag} className="text-[9px] bg-slate-850 text-slate-300 px-2 py-0.5 rounded-full font-semibold border border-slate-800">
                      {tag}
                    </span>
                  ))}
                  {cust.tags.length === 0 && (
                    <span className="text-[9px] text-slate-600 font-medium italic">No tags</span>
                  )}
                </div>
              </div>
            ))}
            {customers.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-500 text-xs bg-slate-900/10 border border-dashed border-slate-800 rounded-2xl">
                No customers found matching the search criteria.
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-8 pt-4 border-t border-slate-900/60 text-xs">
              <span className="text-slate-500">
                Page <span className="font-semibold text-slate-300">{page}</span> of{' '}
                <span className="font-semibold text-slate-300">{totalPages}</span> ({totalCount} clients)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 border border-slate-800 bg-[#111827] text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-55 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 border border-slate-800 bg-[#111827] text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-55 disabled:cursor-not-allowed transition-all"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Editor Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-xl glass border border-slate-800 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg font-display text-slate-200 mb-6">
              {editId ? 'Edit Customer' : 'Add New Customer'}
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-500/20 text-red-300 text-xs rounded-lg text-center font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Customer Name</label>
                  <input
                    type="text"
                    id="cust_contact_name"
                    required
                    value={contactName}
                    onChange={(e) => {
                      setContactName(e.target.value);
                      setFormErrors(prev => ({ ...prev, contact_name: '' }));
                    }}
                    className={`w-full bg-[#111827] border text-slate-200 py-2.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                      formErrors.contact_name ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                    }`}
                    placeholder="Amit Sharma"
                  />
                  {formErrors.contact_name && (
                    <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.contact_name}</span>
                  )}
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Phone Number (10 digits)</label>
                  <input
                    type="text"
                    id="cust_phone"
                    required
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                      setFormErrors(prev => ({ ...prev, phone: '' }));
                    }}
                    className={`w-full bg-[#111827] border text-slate-200 py-2.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                      formErrors.phone ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                    }`}
                    placeholder="9988776655"
                  />
                  {formErrors.phone && (
                    <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.phone}</span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Email Address</label>
                <input
                  type="email"
                  id="cust_email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFormErrors(prev => ({ ...prev, email: '' }));
                  }}
                  className={`w-full bg-[#111827] border text-slate-200 py-2.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                    formErrors.email ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                  }`}
                  placeholder="billing@delhitech.in"
                />
                {formErrors.email && (
                  <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.email}</span>
                )}
              </div>

              {/* Billing Address Sub-form */}
              <div className="border-t border-slate-800 pt-4">
                <h4 className="font-bold text-slate-300 mb-3 font-display">Billing Address</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Street Address</label>
                    <input
                      type="text"
                      id="cust_billing_street"
                      required
                      value={billingStreet}
                      onChange={(e) => {
                        setBillingStreet(e.target.value);
                        setFormErrors(prev => ({ ...prev, billing_street: '' }));
                      }}
                      className={`w-full bg-[#111827] border text-slate-200 py-2.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                        formErrors.billing_street ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                      }`}
                      placeholder="Sec 10, Rohini Block B"
                    />
                    {formErrors.billing_street && (
                      <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.billing_street}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">City</label>
                      <input
                        type="text"
                        id="cust_billing_city"
                        required
                        value={billingCity}
                        onChange={(e) => {
                          setBillingCity(e.target.value);
                          setFormErrors(prev => ({ ...prev, billing_city: '' }));
                        }}
                        className={`w-full bg-[#111827] border text-slate-200 py-2.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                          formErrors.billing_city ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                        }`}
                        placeholder="New Delhi"
                      />
                      {formErrors.billing_city && (
                        <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.billing_city}</span>
                      )}
                    </div>
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">State / Province</label>
                      <input
                        type="text"
                        id="cust_billing_state"
                        required
                        value={billingState}
                        onChange={(e) => {
                          setBillingState(e.target.value);
                          setFormErrors(prev => ({ ...prev, billing_state: '' }));
                        }}
                        className={`w-full bg-[#111827] border text-slate-200 py-2.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                          formErrors.billing_state ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                        }`}
                        placeholder="Delhi"
                      />
                      {formErrors.billing_state && (
                        <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.billing_state}</span>
                      )}
                    </div>
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">ZIP / Postal Code</label>
                      <input
                        type="text"
                        id="cust_billing_zip"
                        required
                        value={billingZip}
                        onChange={(e) => {
                          setBillingZip(e.target.value);
                          setFormErrors(prev => ({ ...prev, billing_zip: '' }));
                        }}
                        className={`w-full bg-[#111827] border text-slate-200 py-2.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                          formErrors.billing_zip ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                        }`}
                        placeholder="110085"
                      />
                      {formErrors.billing_zip && (
                        <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.billing_zip}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Country</label>
                    <input
                      type="text"
                      id="cust_billing_country"
                      required
                      value={billingCountry}
                      onChange={(e) => {
                        setBillingCountry(e.target.value);
                        setFormErrors(prev => ({ ...prev, billing_country: '' }));
                      }}
                      className={`w-full bg-[#111827] border text-slate-200 py-2.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                        formErrors.billing_country ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                      }`}
                    />
                    {formErrors.billing_country && (
                      <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.billing_country}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800 pt-4">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-full bg-[#111827] border border-slate-800 text-slate-200 py-2.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500"
                    placeholder="vip, corporate, monthly-retainer"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Internal Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full bg-[#111827] border border-slate-800 text-slate-200 py-1.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500 resize-none"
                    placeholder="Any comments..."
                  />
                </div>
              </div>

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
                  {isSubmitting ? 'Saving...' : (editId ? 'Save Changes' : 'Create Customer')}
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

export default Customers;
