import React, { useState, useEffect } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { fetcher } from '../utils/fetcher';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, Search, ChevronRight, Check, X, 
  Send, CreditCard, Sparkles, Upload, Trash2, FileText, Download 
} from 'lucide-react';
import { Invoice, Customer, Product, InvoiceLineItem } from '../types';
import DatePicker from '../components/DatePicker';
import PaymentSetupModal from '../components/PaymentSetupModal';

const Invoices: React.FC = () => {
  const { activeOrg, organizations } = useAuth();
  
  // Tab controller
  const [activeTab, setActiveTab] = useState<'list' | 'new' | 'ocr' | 'ai'>('list');
  
  // Filtering & Search & Pagination
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  
  const currentOrg = activeOrg;
  const [showPaymentSetup, setShowPaymentSetup] = useState(false);
  
  const invoiceCacheKey = activeOrg ? `/invoices/?page=${page}&search=${debouncedSearch}&status=${statusFilter}` : null;
  const { data: invoicesData, error: invoicesError, mutate: mutateInvoices } = useSWR(invoiceCacheKey, fetcher);
  
  const customerCacheKey = activeOrg ? '/customers/?no_pagination=true' : null;
  const { data: customersData } = useSWR(customerCacheKey, fetcher);
  
  const productCacheKey = activeOrg ? '/products/?no_pagination=true' : null;
  const { data: productsData } = useSWR(productCacheKey, fetcher);

  const invoices: Invoice[] = invoicesData?.results || invoicesData || [];
  const totalCount = invoicesData?.count || invoices.length;
  
  const customers: Customer[] = customersData?.results || customersData || [];
  const products: Product[] = productsData?.results || productsData || [];

  const isLoading = !invoicesData && !invoicesError;

  // Drawer details view
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [transitionComment, setTransitionComment] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');

  // 1. Invoice Builder Form State
  const [customer, setCustomer] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [discountAmount, setDiscountAmount] = useState('0');
  const currency = 'INR';
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    { product: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }
  ]);
  
  const [formError, setFormError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [workflowError, setWorkflowError] = useState('');

  // 2. OCR and AI Prompt Form States
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTargetCustomer, setAiTargetCustomer] = useState('');

  // 3. UI states & Toasts
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Auto-set AI target customer when customers load
  useEffect(() => {
    if (customers.length > 0 && !aiTargetCustomer) {
      setAiTargetCustomer(customers[0].id);
    }
  }, [customers]);

  // Reset the invoice builder form to pristine state
  const resetForm = () => {
    setCustomer('');
    setIssueDate(new Date().toISOString().split('T')[0]);
    setDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setDiscountAmount('0');
    setTerms('');
    setNotes('');
    setLineItems([{ product: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]);
    setFormError('');
    setFormErrors({});
  };

  // Debouncing Search Input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page to 1 on new search
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    const handleSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      
      const { model } = detail;
      
      if (model === 'customer') {
        globalMutate(key => typeof key === 'string' && key.startsWith('/customers/'));
      } else if (model === 'product') {
        globalMutate(key => typeof key === 'string' && key.startsWith('/products/'));
        // Local logic to update line items if a product changes is omitted for brevity,
        // it can be done through SWR caching natively when building the invoice.
      } else if (model === 'invoice') {
        globalMutate(key => typeof key === 'string' && key.startsWith('/invoices/'));
      }
    };
    
    window.addEventListener('app:sync', handleSync);
    return () => window.removeEventListener('app:sync', handleSync);
  }, []);

  // Calculations for dynamic invoice preview
  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;
    lineItems.forEach((item) => {
      const lineSub = (item.quantity || 0) * (item.unit_price || 0);
      const lineTax = lineSub * ((item.tax_rate || 0) / 100);
      subtotal += lineSub;
      taxAmount += lineTax;
    });
    const discount = parseFloat(discountAmount) || 0;
    const total = Math.max(subtotal + taxAmount - discount, 0);
    return { subtotal, taxAmount, total };
  };

  const { subtotal, taxAmount, total } = calculateTotals();

  // Invoice Line item dynamic row mutators
  const handleLineChange = (index: number, field: keyof InvoiceLineItem, value: any) => {
    const updated = [...lineItems];
    
    if (field === 'product') {
      const selectedProd = products.find(p => p.id === value);
      if (selectedProd) {
        updated[index] = {
          product: selectedProd.id,
          product_name: selectedProd.name,
          description: selectedProd.description || '',
          quantity: updated[index].quantity,
          unit_price: selectedProd.price,
          tax_rate: selectedProd.tax_rate
        };
        setLineItems(updated);
        return;
      }
    }
    
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setLineItems(updated);
  };

  const addLineRow = () => {
    setLineItems([...lineItems, { product: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]);
  };

  const removeLineRow = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  // Submit invoice builder creation
  const handleInvoiceCreate = async (e: React.FormEvent, customStatus = 'draft') => {
    e.preventDefault();
    setFormError('');
    setFormErrors({});
    
    // Mandatory Payment Setup Pre-flight Check
    if (currentOrg && !currentOrg.payment_upi_id && !currentOrg.payment_qr_code) {
      setShowPaymentSetup(true);
      return;
    }
    
    // Client-side validation
    const errors: Record<string, string> = {};
    if (!customer) errors.customer = "Please select a customer.";
    if (!issueDate) errors.issue_date = "Issue date is required.";
    if (!dueDate) errors.due_date = "Due date is required.";
    if (issueDate && dueDate && dueDate < issueDate) {
      errors.due_date = "Due date cannot be earlier than the issue date.";
    }

    // Line items validation
    if (!lineItems || lineItems.length === 0) {
      errors.line_items = "An invoice must contain at least one line item.";
    } else {
      lineItems.forEach((item, index) => {
        if (!item.product) {
          errors[`line_item_${index}_product`] = "Product is required.";
        }
        if (item.quantity <= 0) {
          errors[`line_item_${index}_quantity`] = "Quantity must be greater than zero.";
        }
      });
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      const firstInvalidKey = Object.keys(errors)[0];
      const el = document.getElementById(`inv_${firstInvalidKey}`);
      if (el) el.focus();
      return;
    }

    const payload = {
      customer,
      issue_date: issueDate,
      due_date: dueDate,
      discount_amount: parseFloat(discountAmount) || 0.00,
      currency,
      terms,
      notes,
      status: customStatus,
      line_items: lineItems.map((item) => ({
        product: item.product,
        description: item.description,
        quantity: parseFloat(item.quantity.toString()),
        unit_price: parseFloat(item.unit_price.toString()),
        tax_rate: parseFloat(item.tax_rate.toString())
      }))
    };

    setIsSubmitting(true);
    
    // API Pre-Validation
    try {
      await api.post('/invoices/validate/', payload);
    } catch (err: any) {
      handleError(err);
      setIsSubmitting(false);
      return;
    }

    try {
      const tempId = `temp_${Date.now()}`;
      const tempInv = {
        id: tempId,
        ...payload,
        invoice_number: 'INV-DRAFT',
        total_amount: total,
        subtotal,
        tax_amount: taxAmount,
        organization_id: activeOrg,
        customer_detail: customers.find(c => c.id === customer),
        _status: 'saving' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const optimisticInvoices = [tempInv, ...invoices];
      const optimisticResult = invoicesData?.results ? { ...invoicesData, count: totalCount + 1, results: optimisticInvoices } : optimisticInvoices;

      await mutateInvoices(
        api.post('/invoices/', payload).then(() => fetcher(invoiceCacheKey as string)),
        { optimisticData: optimisticResult, rollbackOnError: true, populateCache: true, revalidate: false }
      );

      resetForm();
      setActiveTab('list');
      showToast('Invoice generated successfully.', 'success');
    } catch (err: any) {
      handleError(err);
    } finally {
      setIsSubmitting(false);
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

      const firstInvalidKey = Object.keys(fieldErrors)[0];
      const el = document.getElementById(`inv_${firstInvalidKey}`);
      if (el) el.focus();

      showToast('Please correct the highlighted errors.', 'error');
    } else {
      const msg = err.response?.data?.non_field_errors?.[0] || err.response?.data?.error || 'Failed to process request.';
      setFormError(msg);
      showToast(msg, 'error');
    }
  };

  // Workflow State Transition Triggers
  const triggerWorkflow = async (action: 'submit' | 'approve' | 'reject' | 'send' | 'record-payment') => {
    if (!selectedInvoice) return;
    setWorkflowError('');
    setIsSubmitting(true);
    try {
      const payload: any = { comment: transitionComment };
      if (action === 'record-payment') {
        if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
          setWorkflowError('Please enter a valid payment amount greater than zero.');
          setIsSubmitting(false);
          return;
        }
        payload.amount = parseFloat(paymentAmount);
      }

      // Optimistic transition
      const updatedInvoice = { ...selectedInvoice };
      if (action === 'submit') updatedInvoice.status = 'pending';
      if (action === 'approve') updatedInvoice.status = 'approved';
      if (action === 'reject') updatedInvoice.status = 'draft';
      if (action === 'send') updatedInvoice.status = 'sent';
      
      const optimisticInvoices = invoices.map(i => i.id === updatedInvoice.id ? updatedInvoice : i);
      const optimisticResult = invoicesData?.results ? { ...invoicesData, results: optimisticInvoices } : optimisticInvoices;
      
      setSelectedInvoice(updatedInvoice); // Optimistically update drawer

      const res = await mutateInvoices(
        api.post(`/invoices/${selectedInvoice.id}/${action}/`, payload).then(() => fetcher(invoiceCacheKey as string)),
        { optimisticData: optimisticResult, rollbackOnError: true, populateCache: true, revalidate: false }
      );
      
      setTransitionComment('');
      setPaymentAmount('');
      
      // Keep drawer updated with final result
      const finalInvoice = (res?.results || res || []).find((i: Invoice) => i.id === selectedInvoice.id);
      if (finalInvoice) {
        setSelectedInvoice(finalInvoice);
      }

      showToast(`Action '${action}' processed successfully!`, 'success');
    } catch (e: any) {
      // Revert selected invoice drawer
      setSelectedInvoice(invoices.find(i => i.id === selectedInvoice.id) || null);
      
      const msg = e.response?.data?.error || e.response?.data?.detail || 'Action failed. Check your permissions.';
      setWorkflowError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPDF = async (invoiceId: string, invoiceNumber: string) => {
    setIsDownloading(true);
    try {
      const response = await api.get(`/invoices/${invoiceId}/download/`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice_${invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('Invoice PDF downloaded successfully.', 'success');
    } catch (err) {
      showToast('Failed to download invoice PDF.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  // AI features view trigger: File upload OCR
  const handleOCRSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ocrFile) return;
    setOcrLoading(true);
    setIsSubmitting(true);
    setFormError('');

    const formData = new FormData();
    formData.append('file', ocrFile);

    try {
      const res = await api.post('/ai/ocr/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Parse OCR result and pre-fill form
      const data = res.data;
      if (data.items && data.items.length > 0) {
        const matchingLines: InvoiceLineItem[] = data.items.map((ocrItem: any) => {
          // Look for matching product SKU/name or assign fallback
          const matchingProd = products.find(p => p.name.toLowerCase().includes(ocrItem.name.toLowerCase())) || products[0];
          return {
            product: matchingProd ? matchingProd.id : '',
            product_name: matchingProd ? matchingProd.name : '',
            description: matchingProd ? (matchingProd.description || '') : ocrItem.name,
            quantity: ocrItem.quantity,
            unit_price: matchingProd ? matchingProd.price : ocrItem.unit_price,
            tax_rate: matchingProd ? matchingProd.tax_rate : ocrItem.tax_rate
          };
        });
        setLineItems(matchingLines);
        setNotes(`Extracted OCR fields from invoice file ${ocrFile.name}. Vendor: ${data.vendor_name}`);
        
        // Redirect to creator tab
        setActiveTab('new');
        showToast('OCR layout scan complete!', 'success');
      } else {
        setFormError('OCR extraction returned no line items. Please try a clearer image or PDF.');
        showToast('OCR returned empty layout.', 'error');
      }
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to parse document. Ensure the file is a valid invoice image or PDF.';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setOcrLoading(false);
      setIsSubmitting(false);
    }
  };

  // AI features view trigger: NLP prompt builder
  const handleAISmartDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt || !aiTargetCustomer) return;
    setAiLoading(true);
    setIsSubmitting(true);
    setFormError('');

    try {
      const res = await api.post('/ai/smart-draft/', {
        prompt: aiPrompt,
        customer_id: aiTargetCustomer
      });
      
      const data = res.data;
      setCustomer(data.customer);
      setTerms(data.terms || '');
      setNotes(`AI Generated Draft for prompt: "${aiPrompt}"`);
      
      const mappedLines = data.line_items.map((li: any) => {
        const matchingProd = products.find(p => p.id === li.product) || products[0];
        return {
          product: matchingProd ? matchingProd.id : '',
          product_name: matchingProd ? matchingProd.name : '',
          description: matchingProd ? (matchingProd.description || '') : li.description,
          quantity: li.quantity,
          unit_price: matchingProd ? matchingProd.price : li.unit_price,
          tax_rate: matchingProd ? matchingProd.tax_rate : li.tax_rate
        };
      });
      setLineItems(mappedLines);
      
      // Redirect to builder tab with pre-filled data
      setActiveTab('new');
      showToast('AI Smart Draft compiled!', 'success');
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to compile AI smart draft. Please rephrase your prompt.';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setAiLoading(false);
      setIsSubmitting(false);
    }
  };

  // Invoices list uses server-side search and filtering directly
  const filteredInvoices = invoices;
  
  const pageSize = 20;
  const totalPages = Math.ceil(totalCount / pageSize);

  const renderSkeletons = () => (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-14 w-full bg-slate-800/20 rounded-xl animate-pulse border border-slate-850/60" />
      ))}
    </div>
  );

  return (
    <div className="p-8">
      {/* Top Banner Navigation tabs */}
      <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold font-display text-gradient">Invoices Module</h2>
          <p className="text-slate-500 text-xs mt-1">SaaS multitenant ledger, approval structures, and automated billing runs</p>
        </div>
        <div className="flex bg-[#111827] border border-slate-800 p-1.5 rounded-xl gap-1 text-xs">
          <button
            onClick={() => setActiveTab('list')}
            className={`py-1.5 px-3 rounded-lg font-semibold transition-all ${
              activeTab === 'list' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Invoice Registry
          </button>
          <button
            onClick={() => { resetForm(); setActiveTab('new'); }}
            className={`py-1.5 px-3 rounded-lg font-semibold transition-all ${
              activeTab === 'new' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Invoice Builder
          </button>

        </div>
      </div>

      {activeTab === 'list' && (
        /* Invoice List Page */
        <div>
          {/* Filters Bar */}
          <div className="glass p-4 rounded-xl border border-slate-800/80 mb-6 flex flex-wrap gap-4 items-center text-xs">
            <div className="flex-1 max-w-xs">
              <label className="text-slate-400 font-bold block mb-1">Search Registry</label>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#111827] border border-slate-800 focus:border-emerald-500 text-slate-200 py-1.5 pl-8 pr-4 rounded-lg focus:outline-none"
                  placeholder="Invoice number or client name..."
                />
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            <div>
              <label className="text-slate-400 font-bold block mb-1">Status Pill</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#111827] border border-slate-800 text-slate-300 py-1.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending Approval</option>
                <option value="approved">Approved</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>

          {/* Table list */}
          {isLoading ? (
            renderSkeletons()
          ) : (
            <div className="glass rounded-xl border border-slate-800/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/20">
                      <th className="p-4 font-semibold">Invoice No</th>
                      <th className="p-4 font-semibold">Customer Name</th>
                      <th className="p-4 font-semibold">Dates</th>
                      <th className="p-4 font-semibold">Amount Due</th>
                      <th className="p-4 font-semibold">Status</th>
                      <th className="p-4 font-semibold text-right">View Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className={`hover:bg-slate-800/10 transition-colors ${inv._status === 'saving' ? 'opacity-60' : ''}`}>
                        <td className="p-4 font-bold text-slate-200">
                          <div className="flex items-center gap-2">
                            {inv.invoice_number}
                            {inv._status === 'saving' && (
                              <span className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded font-bold animate-pulse">
                                Saving...
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 font-medium text-slate-300">{inv.customer_detail?.contact_name}</td>
                        <td className="p-4 text-slate-400">
                          <p>Issue: {inv.issue_date}</p>
                          <p>Due: {inv.due_date}</p>
                        </td>
                        <td className="p-4 font-bold text-slate-200">
                          ₹ {inv.total_amount.toLocaleString()}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                            inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            inv.status === 'overdue' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                            inv.status === 'draft' ? 'bg-slate-800 text-slate-400 border border-slate-700' :
                            'bg-amber-500/10 text-amber-400 border border-amber-500/25'
                          }`}>
                            {inv.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            disabled={inv._status === 'saving'}
                            className="p-1.5 bg-slate-800 hover:bg-emerald-950/60 hover:text-emerald-400 rounded-lg text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredInvoices.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          No matching invoices found in registry.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination Controls */}
          {!isLoading && totalPages > 1 && (
            <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-900/60 text-xs">
              <span className="text-slate-500">
                Page <span className="font-semibold text-slate-300">{page}</span> of{' '}
                <span className="font-semibold text-slate-300">{totalPages}</span> ({totalCount} invoices)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 border border-slate-800 bg-[#111827] text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-55 disabled:cursor-not-allowed transition-all"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 border border-slate-800 bg-[#111827] text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-55 disabled:cursor-not-allowed transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'new' && (
        /* Invoice Builder Form tab */
        <div className="glass p-6 rounded-2xl border border-slate-800/80">
          <h3 className="font-bold text-sm font-display text-slate-200 mb-6">Create Billing Invoice</h3>
          
          {formError && (
            <div className="mb-4 p-3 bg-red-950/60 border border-red-500/20 text-red-300 text-xs rounded-lg text-center font-medium">
              {formError}
            </div>
          )}

          <form onSubmit={(e) => handleInvoiceCreate(e, 'draft')} className="space-y-6 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Select Customer</label>
                <select
                  required
                  id="inv_customer"
                  value={customer}
                  onChange={(e) => {
                    setCustomer(e.target.value);
                    setFormErrors(prev => ({ ...prev, customer: '' }));
                  }}
                  className={`w-full bg-[#111827] border text-slate-200 py-2.5 px-3 rounded-lg focus:outline-none focus:border-emerald-500 ${
                    formErrors.customer ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'
                  }`}
                >
                  <option value="">-- Pick Client --</option>
                  {customers.length === 0 ? (
                    <option value="" disabled>No customers found</option>
                  ) : (
                    customers.map((c) => {
                      const cAny = c as any;
                      const name = c.contact_name || cAny.name || cAny.customer_name || cAny.full_name || c.email || "Unnamed Customer";
                      const phone = c.phone ? ` (${c.phone})` : "";
                      return (
                        <option key={c.id} value={c.id}>
                          {`${name}${phone}`}
                        </option>
                      );
                    })
                  )}
                </select>
                {formErrors.customer && (
                  <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.customer}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Issue Date</label>
                  <DatePicker
                    value={issueDate}
                    onChange={(val) => {
                      setIssueDate(val);
                      setFormErrors(prev => ({ ...prev, issue_date: '' }));
                    }}
                    className={formErrors.issue_date ? 'border-red-500/80 focus:border-red-500' : ''}
                  />
                  {formErrors.issue_date && (
                    <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.issue_date}</span>
                  )}
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Due Date</label>
                  <DatePicker
                    value={dueDate}
                    onChange={(val) => {
                      setDueDate(val);
                      setFormErrors(prev => ({ ...prev, due_date: '' }));
                    }}
                    className={formErrors.due_date ? 'border-red-500/80 focus:border-red-500' : ''}
                  />
                  {formErrors.due_date && (
                    <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors.due_date}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Line items dynamic grid */}
            <div className="border-t border-slate-800 pt-6">
              <h4 className="font-bold text-slate-300 mb-4 font-display">Invoice Line Items</h4>
              <div className="space-y-4">
                {formErrors.line_items && (
                  <div className="p-3 bg-red-950/40 border border-red-500/20 text-red-300 text-xs rounded-lg font-medium">
                    {formErrors.line_items}
                  </div>
                )}
                {lineItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end bg-slate-900/10 p-3 rounded-xl border border-slate-800/40">
                    <div className="md:col-span-2">
                      <label className="text-slate-400 font-semibold block mb-1">Select Catalog Product/Service</label>
                      <select
                        required
                        value={item.product}
                        onChange={(e) => {
                          handleLineChange(index, 'product', e.target.value);
                          setFormErrors(prev => ({ ...prev, [`line_item_${index}_product`]: '' }));
                        }}
                        className={`w-full bg-[#111827] border text-slate-200 py-2 px-3 rounded-lg focus:outline-none ${
                          formErrors[`line_item_${index}_product`] ? 'border-red-500/80' : 'border-slate-800'
                        }`}
                      >
                        <option value="">-- Select Product --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                      {formErrors[`line_item_${index}_product`] && (
                        <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors[`line_item_${index}_product`]}</span>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-slate-400 font-semibold block mb-1">Row Description</label>
                      <input
                        type="text"
                        value={item.description}
                        readOnly
                        className="w-full bg-slate-900/40 border border-slate-850 text-slate-400 py-2 px-3 rounded-lg focus:outline-none cursor-not-allowed opacity-70"
                        placeholder="Service details..."
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 md:col-span-2">
                      <div>
                        <label className="text-slate-400 font-semibold block mb-1">Qty</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={item.quantity}
                          onChange={(e) => {
                            handleLineChange(index, 'quantity', parseFloat(e.target.value) || 0);
                            setFormErrors(prev => ({ ...prev, [`line_item_${index}_quantity`]: '' }));
                          }}
                          className={`w-full bg-[#111827] border text-slate-200 py-2 px-2 rounded-lg focus:outline-none text-center ${
                            formErrors[`line_item_${index}_quantity`] ? 'border-red-500/80' : 'border-slate-800'
                          }`}
                        />
                        {formErrors[`line_item_${index}_quantity`] && (
                          <span className="text-red-500 text-[10px] mt-1 block font-semibold">{formErrors[`line_item_${index}_quantity`]}</span>
                        )}
                      </div>
                      <div>
                        <label className="text-slate-400 font-semibold block mb-1">Rate</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={item.unit_price}
                          readOnly
                          className="w-full bg-slate-900/40 border border-slate-850 text-slate-400 py-2 px-2 rounded-lg focus:outline-none text-center cursor-not-allowed opacity-70"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-6">
                        <span className="text-[10px] text-slate-400 font-bold block">{item.tax_rate}% Tax</span>
                        <button
                          type="button"
                          onClick={() => removeLineRow(index)}
                          className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addLineRow}
                  className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-bold"
                >
                  <Plus className="w-4 h-4" /> Add Row Line
                </button>
              </div>
            </div>

            {/* Terms and summaries */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-800 pt-6">
              <div className="space-y-4">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Discount Amount (₹)</label>
                  <input
                    type="number"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-full max-w-[200px] bg-[#111827] border border-slate-800 text-slate-200 py-2 px-3 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Terms & Conditions</label>
                  <textarea
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    rows={4}
                    className="w-full bg-[#111827] border border-slate-800 text-slate-200 py-1.5 px-3 rounded-lg focus:outline-none"
                    placeholder="Due on receipt..."
                  />
                </div>
              </div>

              {/* Live compilation preview card */}
              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between">
                <div>
                  <h5 className="font-bold text-slate-300 uppercase tracking-wider text-[10px] mb-3">Live Total Compiler</h5>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Subtotal:</span>
                      <span>₹ {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Taxes & GST:</span>
                      <span>₹ {taxAmount.toFixed(2)}</span>
                    </div>
                    {parseFloat(discountAmount) > 0 && (
                      <div className="flex justify-between text-rose-400 font-semibold">
                        <span>Discount:</span>
                        <span>-₹ {parseFloat(discountAmount).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="border-t border-slate-800/80 pt-4 mt-4 flex justify-between items-center">
                  <span className="font-bold text-slate-200 font-display">Grand Total Due:</span>
                  <span className="text-lg font-bold font-display text-emerald-400">₹ {total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                disabled={isSubmitting}
                className="bg-transparent border border-slate-800 hover:bg-slate-800/40 text-slate-300 font-semibold py-2.5 px-6 rounded-xl disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 px-6 rounded-xl disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                type="button"
                onClick={(e) => handleInvoiceCreate(e, 'pending')}
                disabled={isSubmitting}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-6 rounded-xl transition-all glow-emerald disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
              </button>
            </div>
          </form>
        </div>
      )}



      {/* Drawer Details Panel for Selected Invoice */}
      {selectedInvoice && (
        <div className="fixed inset-y-0 right-0 w-96 bg-[#090e18] border-l border-slate-800/80 shadow-2xl z-50 p-6 flex flex-col justify-between overflow-y-auto text-xs">
          <div>
            {/* Header drawer close */}
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800/80">
              <div>
                <h4 className="font-bold text-sm text-slate-200">{selectedInvoice.invoice_number}</h4>
                <span className="text-[10px] text-slate-500">Invoice Timeline Details</span>
              </div>
              <button 
                onClick={() => setSelectedInvoice(null)} 
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Details details */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-semibold">Status:</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-slate-800 text-slate-300">
                  {selectedInvoice.status.replace('_', ' ')}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block mb-1">Customer Details:</span>
                <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl">
                  <p className="font-bold text-slate-300">{selectedInvoice.customer_detail?.contact_name}</p>
                  <p className="text-[10px] text-slate-500">{selectedInvoice.customer_detail?.email}</p>
                </div>
              </div>

              {/* Total breakdown */}
              <div className="space-y-1 bg-slate-900/40 p-3 border border-slate-800 rounded-xl">
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotal:</span>
                  <span className="text-slate-300">₹ {Number(selectedInvoice.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Taxes:</span>
                  <span className="text-slate-300">₹ {Number(selectedInvoice.tax_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Discount:</span>
                  <span className="text-slate-300">-₹ {Number(selectedInvoice.discount_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-slate-800 pt-1.5 mt-1.5">
                  <span className="text-slate-300">Grand Total:</span>
                  <span className="text-emerald-400">₹ {Number(selectedInvoice.total_amount || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Document download */}
              {selectedInvoice.status !== 'draft' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownloadPDF(selectedInvoice.id, selectedInvoice.invoice_number)}
                    disabled={isDownloading}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-bold py-2 rounded-xl text-center flex items-center justify-center gap-1 border border-slate-700"
                  >
                    <Download className={`w-3.5 h-3.5 ${isDownloading ? 'animate-spin' : ''}`} /> Inline PDF
                  </button>
                  {selectedInvoice.pdf_url && (
                    <a
                      href={selectedInvoice.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 font-bold py-2 rounded-xl text-center flex items-center justify-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" /> Raw S3
                    </a>
                  )}
                </div>
              )}

              {/* Workflow log history */}
              <div className="border-t border-slate-800/80 pt-4">
                <h5 className="font-bold text-slate-300 uppercase tracking-wider text-[10px] mb-3">Approval Workflow Steps</h5>
                <div className="space-y-3 relative pl-3 border-l border-slate-800">
                  {selectedInvoice.workflow_history?.map((log) => (
                    <div key={log.id} className="relative">
                      <div className="absolute -left-[16px] top-1.5 w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                      <p className="font-bold text-slate-300 capitalize">{log.action.replace('_', ' ')}</p>
                      <p className="text-[10px] text-slate-500">{log.performed_by_name} • {new Date(log.created_at).toLocaleTimeString()}</p>
                      {log.comment && <p className="text-[10px] text-slate-400 italic mt-0.5">"{log.comment}"</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Settings / Scan to Pay Widget */}
          {currentOrg && (currentOrg.payment_upi_id || currentOrg.payment_qr_code) && selectedInvoice.status !== 'draft' && selectedInvoice.status !== 'paid' && (
            <div className="mt-6 bg-[#0f1423] border border-slate-700/60 p-4 rounded-xl flex flex-col items-center">
              <h6 className="font-bold text-slate-300 text-[11px] uppercase tracking-wider mb-3 w-full text-center">Scan To Pay</h6>
              
              {currentOrg.payment_qr_code ? (
                <img src={`http://localhost:8000${currentOrg.payment_qr_code}`} alt="Payment QR" className="w-32 h-32 rounded-lg bg-white p-2 border border-slate-700 mb-3 shadow-[0_0_15px_rgba(16,185,129,0.1)]" />
              ) : (
                <div className="w-32 h-32 rounded-lg bg-[#161f30] flex items-center justify-center mb-3 border border-slate-700">
                  <span className="text-xs text-slate-500">QR Pending</span>
                </div>
              )}
              
              <div className="bg-[#1e293b] px-3 py-2 rounded flex items-center gap-2 border border-slate-700 w-full justify-between">
                <span className="text-xs text-slate-400 font-mono truncate">
                  {currentOrg.payment_upi_id}
                </span>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(currentOrg.payment_upi_id || '');
                    showToast('UPI ID copied to clipboard', 'success');
                  }}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors shrink-0"
                  title="Copy UPI ID"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                </button>
              </div>
            </div>
          )}

          {/* Workflow Transitions Buttons */}
          <div className="border-t border-slate-800/80 pt-4 mt-6 space-y-4">
            {/* Workflow error display */}
            {workflowError && (
              <div className="p-2.5 bg-red-950/60 border border-red-500/20 text-red-300 text-[10px] rounded-lg font-medium">
                {workflowError}
              </div>
            )}
            {/* Context message block */}
            <div className="space-y-2">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Transition comment</label>
              <input
                type="text"
                value={transitionComment}
                onChange={(e) => setTransitionComment(e.target.value)}
                className="w-full bg-[#111827] border border-slate-800 text-slate-200 py-1.5 px-3 rounded-lg focus:outline-none"
                placeholder="Log reason..."
              />
            </div>

            {selectedInvoice.status === 'draft' && (
              <button
                onClick={() => triggerWorkflow('submit')}
                disabled={isSubmitting}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl transition-all glow-emerald flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
              </button>
            )}

            {selectedInvoice.status === 'pending' && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => triggerWorkflow('approve')}
                  disabled={isSubmitting}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => triggerWorkflow('reject')}
                  disabled={isSubmitting}
                  className="bg-[#ef4444] hover:bg-red-600 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            )}

            {selectedInvoice.status === 'approved' && (
              <button
                onClick={() => triggerWorkflow('send')}
                disabled={isSubmitting}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl transition-all glow-emerald flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> {isSubmitting ? 'Sending...' : 'Send Email via Celery'}
              </button>
            )}

            {['sent', 'viewed', 'partially_paid'].includes(selectedInvoice.status) && (
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    disabled={isSubmitting}
                    className="w-2/3 bg-[#111827] border border-slate-800 text-slate-200 py-1.5 px-3 rounded-lg focus:outline-none disabled:opacity-50"
                    placeholder="Payment Amount"
                  />
                  <button
                    onClick={() => triggerWorkflow('record-payment')}
                    disabled={isSubmitting}
                    className="w-1/3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Record
                  </button>
                </div>
              </div>
            )}
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
      {/* Modals */}
      <PaymentSetupModal
        isOpen={showPaymentSetup}
        onClose={() => setShowPaymentSetup(false)}
        onSuccess={(updatedOrg) => {
          // Trigger SWR revalidation or reload window to pick up new org context
          window.location.reload();
        }}
        preventClose={true} // Forces them to complete it!
      />
    </div>
  );
};

export default Invoices;
