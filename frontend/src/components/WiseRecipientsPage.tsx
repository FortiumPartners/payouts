/**
 * Wise Recipients management page.
 * CRUD interface for payee → Wise email mappings.
 */

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, ArrowLeft, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, WiseRecipient, WiseAccount } from '../lib/api';

interface RecipientFormData {
  payeeName: string;
  wiseEmail: string;
  targetCurrency: 'USD' | 'CAD';
  wiseContactId?: number;
}

function RecipientModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  isEdit,
  wiseAccounts,
  loadingAccounts,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: RecipientFormData) => Promise<void>;
  initialData?: Partial<RecipientFormData>;
  isEdit: boolean;
  wiseAccounts: WiseAccount[];
  loadingAccounts: boolean;
}) {
  const [formData, setFormData] = useState<RecipientFormData>({
    payeeName: initialData?.payeeName || '',
    wiseEmail: initialData?.wiseEmail || '',
    targetCurrency: initialData?.targetCurrency || 'USD',
    wiseContactId: undefined,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        payeeName: initialData?.payeeName || '',
        wiseEmail: initialData?.wiseEmail || '',
        targetCurrency: initialData?.targetCurrency || 'USD',
        wiseContactId: undefined,
      });
      setError(null);
      setSearchQuery('');
      setShowAccountDropdown(false);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const selectWiseAccount = (account: WiseAccount) => {
    setFormData({
      ...formData,
      wiseEmail: account.email || '',
      targetCurrency: (account.currency === 'CAD' ? 'CAD' : 'USD') as 'USD' | 'CAD',
      wiseContactId: account.id,
    });
    setShowAccountDropdown(false);
    setSearchQuery('');
  };

  const filteredAccounts = wiseAccounts.filter((account) => {
    const query = searchQuery.toLowerCase();
    return (
      account.name.toLowerCase().includes(query) ||
      (account.nickname?.toLowerCase().includes(query)) ||
      (account.email?.toLowerCase().includes(query))
    );
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white border rounded-lg shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">
            {isEdit ? 'Edit Recipient' : 'Add Recipient'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-red-800 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Payee Name (from PartnerConnect)
            </label>
            <input
              type="text"
              value={formData.payeeName}
              onChange={(e) => setFormData({ ...formData, payeeName: e.target.value })}
              disabled={isEdit}
              className="w-full px-3 py-2 border rounded-md bg-background disabled:bg-muted disabled:cursor-not-allowed"
              placeholder="e.g., Robert Andrew Halford"
              required
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground mt-1">
                Payee name cannot be changed
              </p>
            )}
          </div>

          {/* Wise Account Selector - only show when adding */}
          {!isEdit && (
            <div className="relative">
              <label className="block text-sm font-medium mb-1">
                Select Wise Recipient
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowAccountDropdown(true);
                  }}
                  onFocus={() => setShowAccountDropdown(true)}
                  className="w-full pl-10 pr-3 py-2 border rounded-md bg-background"
                  placeholder="Search Wise recipients..."
                />
              </div>
              {showAccountDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {loadingAccounts ? (
                    <div className="p-3 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Loading Wise recipients...
                    </div>
                  ) : filteredAccounts.length === 0 ? (
                    <div className="p-3 text-center text-muted-foreground">
                      No matching recipients found
                    </div>
                  ) : (
                    filteredAccounts.map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => selectWiseAccount(account)}
                        className="w-full px-3 py-2 text-left hover:bg-muted flex justify-between items-center border-b last:border-b-0"
                      >
                        <div>
                          <div className="font-medium">{account.name}</div>
                          {account.nickname && (
                            <div className="text-xs text-muted-foreground">{account.nickname}</div>
                          )}
                          <div className="text-xs text-muted-foreground">{account.email}</div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          account.currency === 'CAD' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {account.currency}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Search and select from existing Wise recipients, or enter manually below
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Wise Email
            </label>
            <input
              type="email"
              value={formData.wiseEmail}
              onChange={(e) => setFormData({ ...formData, wiseEmail: e.target.value, wiseContactId: undefined })}
              className="w-full px-3 py-2 border rounded-md bg-background"
              placeholder="e.g., payee@email.com"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formData.wiseContactId
                ? `Linked to Wise contact #${formData.wiseContactId}`
                : 'The email associated with their Wise account'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Target Currency
            </label>
            <select
              value={formData.targetCurrency}
              onChange={(e) => setFormData({ ...formData, targetCurrency: e.target.value as 'USD' | 'CAD' })}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="USD">USD - US Dollar</option>
              <option value="CAD">CAD - Canadian Dollar</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Currency for the recipient's Wise balance
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Recipient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function WiseRecipientsPage() {
  const [recipients, setRecipients] = useState<WiseRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<WiseRecipient | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [wiseAccounts, setWiseAccounts] = useState<WiseAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const loadRecipients = async () => {
    try {
      const { recipients } = await api.getWiseRecipients();
      setRecipients(recipients);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recipients');
    } finally {
      setLoading(false);
    }
  };

  const loadWiseAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { accounts } = await api.getWiseAccounts();
      setWiseAccounts(accounts);
    } catch (err) {
      console.error('Failed to load Wise accounts:', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    loadRecipients();
    loadWiseAccounts();
  }, []);

  const handleAdd = () => {
    setEditingRecipient(null);
    setModalOpen(true);
  };

  const handleEdit = (recipient: WiseRecipient) => {
    setEditingRecipient(recipient);
    setModalOpen(true);
  };

  const handleSave = async (data: RecipientFormData) => {
    if (editingRecipient) {
      await api.updateWiseRecipient(editingRecipient.id, {
        wiseEmail: data.wiseEmail,
        targetCurrency: data.targetCurrency,
      });
    } else {
      await api.createWiseRecipient(data);
    }
    await loadRecipients();
  };

  const handleDelete = async (id: string) => {
    await api.deleteWiseRecipient(id);
    setDeleteConfirm(null);
    await loadRecipients();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 hover:bg-muted rounded-md">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-semibold">Wise Recipients</h1>
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Recipient
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4">
            <p className="text-sm text-muted-foreground">
              Map PartnerConnect payee names to their Wise email addresses for Canada payments.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600">
              <p>Error: {error}</p>
            </div>
          ) : recipients.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No recipients configured yet.</p>
              <p className="text-sm mt-2">
                Click "Add Recipient" to map a payee to their Wise email.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium">Payee Name</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Wise Email</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Currency</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Contact ID</th>
                    <th className="px-6 py-3 text-right text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((recipient) => (
                    <tr key={recipient.id} className="border-b hover:bg-muted/50">
                      <td className="px-6 py-4 font-medium">{recipient.payeeName}</td>
                      <td className="px-6 py-4">{recipient.wiseEmail}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          recipient.targetCurrency === 'USD'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {recipient.targetCurrency}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                        {recipient.wiseContactId || '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(recipient)}
                            className="p-2 hover:bg-muted rounded-md"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {deleteConfirm === recipient.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(recipient.id)}
                                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-2 py-1 text-xs border rounded hover:bg-muted"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(recipient.id)}
                              className="p-2 hover:bg-muted rounded-md text-red-600"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      <RecipientModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialData={editingRecipient ? {
          payeeName: editingRecipient.payeeName,
          wiseEmail: editingRecipient.wiseEmail,
          targetCurrency: editingRecipient.targetCurrency as 'USD' | 'CAD',
        } : undefined}
        isEdit={!!editingRecipient}
        wiseAccounts={wiseAccounts}
        loadingAccounts={loadingAccounts}
      />
    </div>
  );
}
