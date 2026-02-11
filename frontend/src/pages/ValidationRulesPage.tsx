/**
 * Admin UI for managing validation rules.
 * CRUD interface: create, edit, enable/disable, reorder, delete rules.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Check,
  Shield,
  Sparkles,
} from 'lucide-react';
import { api, ValidationRule } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

const RULE_TYPE_LABELS: Record<string, string> = {
  required_field: 'Required Field',
  amount_threshold: 'Amount Threshold',
  approval_required: 'Approval Required',
  duplicate_detection: 'Duplicate Detection',
  custom: 'Custom',
};

const RULE_TYPE_COLORS: Record<string, string> = {
  required_field: 'bg-blue-100 text-blue-800',
  amount_threshold: 'bg-amber-100 text-amber-800',
  approval_required: 'bg-purple-100 text-purple-800',
  duplicate_detection: 'bg-orange-100 text-orange-800',
  custom: 'bg-gray-100 text-gray-800',
};

interface RuleFormData {
  name: string;
  ruleType: ValidationRule['ruleType'];
  conditions: Record<string, unknown>;
  active: boolean;
  priority: number;
}

function conditionsToString(conditions: Record<string, unknown>): string {
  return JSON.stringify(conditions, null, 2);
}

function RuleFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  isEdit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: RuleFormData) => Promise<void>;
  initialData?: Partial<RuleFormData>;
  isEdit: boolean;
}) {
  const [formData, setFormData] = useState<RuleFormData>({
    name: '',
    ruleType: 'required_field',
    conditions: {},
    active: true,
    priority: 0,
  });
  const [conditionsText, setConditionsText] = useState('{}');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const data: RuleFormData = {
        name: initialData?.name || '',
        ruleType: initialData?.ruleType || 'required_field',
        conditions: initialData?.conditions || {},
        active: initialData?.active ?? true,
        priority: initialData?.priority ?? 0,
      };
      setFormData(data);
      setConditionsText(conditionsToString(data.conditions));
      setError(null);
    }
  }, [isOpen, initialData]);

  // Update conditions template when rule type changes (only for new rules)
  useEffect(() => {
    if (!isEdit && formData.ruleType) {
      const templates: Record<string, Record<string, unknown>> = {
        required_field: { field: 'payeeName', label: 'Payee Name' },
        amount_threshold: { threshold: 10000, message: 'Amount exceeds threshold' },
        approval_required: { field: 'status', requiredValue: 'Approved', label: 'Status' },
        duplicate_detection: { fields: ['payeeName', 'amount', 'date'], message: 'Possible duplicate detected' },
        custom: { expression: 'amount > 0', message: 'Custom check failed' },
      };
      const template = templates[formData.ruleType] || {};
      setConditionsText(conditionsToString(template));
    }
  }, [formData.ruleType, isEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const conditions = JSON.parse(conditionsText);
      await onSave({ ...formData, conditions });
      onClose();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON in conditions');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-lg">
            {isEdit ? 'Edit Rule' : 'Create Rule'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Rule Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Payee Name Required"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Rule Type</label>
            <select
              value={formData.ruleType}
              onChange={(e) => setFormData({ ...formData, ruleType: e.target.value as ValidationRule['ruleType'] })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Conditions (JSON)</label>
            <textarea
              value={conditionsText}
              onChange={(e) => setConditionsText(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
              rows={6}
              placeholder='{"field": "payeeName", "label": "Payee Name"}'
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formData.ruleType === 'required_field' && 'Fields: field (bill property), label (display name)'}
              {formData.ruleType === 'amount_threshold' && 'Fields: threshold (number), message (optional)'}
              {formData.ruleType === 'approval_required' && 'Fields: field, requiredValue, label (optional)'}
              {formData.ruleType === 'duplicate_detection' && 'Fields: fields (array of bill properties), message (optional)'}
              {formData.ruleType === 'custom' && 'Fields: expression (e.g., "amount > 0"), message (optional)'}
            </p>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Priority</label>
              <input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                min={0}
              />
              <p className="text-xs text-muted-foreground mt-1">Lower = higher priority</p>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="active" className="text-sm font-medium">Active</label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatConditions(rule: ValidationRule): string {
  const c = rule.conditions;
  switch (rule.ruleType) {
    case 'required_field':
      return `Field: ${(c as { label?: string; field?: string }).label || (c as { field?: string }).field || 'unknown'}`;
    case 'amount_threshold':
      return `Threshold: $${((c as { threshold?: number }).threshold || 0).toLocaleString()}`;
    case 'approval_required':
      return `${(c as { label?: string }).label || (c as { field?: string }).field} = ${(c as { requiredValue?: string }).requiredValue}`;
    case 'duplicate_detection':
      return `Check: ${((c as { fields?: string[] }).fields || []).join(', ')}`;
    case 'custom':
      return `Expr: ${(c as { expression?: string }).expression || 'none'}`;
    default:
      return JSON.stringify(c);
  }
}

export function ValidationRulesPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ValidationRule | null>(null);
  const [seeding, setSeeding] = useState(false);

  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      const { rules: data } = await api.getValidationRules();
      setRules(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleCreate = async (data: RuleFormData) => {
    await api.createValidationRule(data);
    await loadRules();
  };

  const handleUpdate = async (data: RuleFormData) => {
    if (!editingRule) return;
    await api.updateValidationRule(editingRule.id, data);
    await loadRules();
  };

  const handleDelete = async (rule: ValidationRule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    await api.deleteValidationRule(rule.id);
    await loadRules();
  };

  const handleToggleActive = async (rule: ValidationRule) => {
    await api.updateValidationRule(rule.id, { active: !rule.active });
    await loadRules();
  };

  const handleMovePriority = async (rule: ValidationRule, direction: 'up' | 'down') => {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex(r => r.id === rule.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const other = sorted[swapIdx];
    // Swap priorities
    await Promise.all([
      api.updateValidationRule(rule.id, { priority: other.priority }),
      api.updateValidationRule(other.id, { priority: rule.priority }),
    ]);
    await loadRules();
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      await api.seedValidationRules();
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed rules');
    } finally {
      setSeeding(false);
    }
  };

  const openCreate = () => {
    setEditingRule(null);
    setModalOpen(true);
  };

  const openEdit = (rule: ValidationRule) => {
    setEditingRule(rule);
    setModalOpen(true);
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
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6" />
              <h1 className="text-xl font-semibold">Validation Rules</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-muted-foreground">{user.email}</span>
            )}
            {rules.length === 0 && !loading && (
              <button
                onClick={handleSeedDefaults}
                disabled={seeding}
                className="flex items-center gap-2 px-4 py-2 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Seed Defaults
              </button>
            )}
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Rule
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Total Rules</p>
            <p className="text-2xl font-bold">{rules.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-green-600">
              {rules.filter(r => r.active).length}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Inactive</p>
            <p className="text-2xl font-bold text-muted-foreground">
              {rules.filter(r => !r.active).length}
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Rules table */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">Rules</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Rules are evaluated in priority order. Lower number = higher priority.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No validation rules configured.</p>
              <p className="text-sm mt-2">
                Click "Seed Defaults" to load recommended rules, or "Add Rule" to create custom rules.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium w-16">Priority</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Conditions</th>
                    <th className="px-4 py-3 text-center text-sm font-medium w-20">Status</th>
                    <th className="px-4 py-3 text-center text-sm font-medium w-20">Order</th>
                    <th className="px-4 py-3 text-right text-sm font-medium w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule, idx) => (
                    <tr key={rule.id} className={`border-b hover:bg-muted/50 ${!rule.active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                        {rule.priority}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-sm">{rule.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${RULE_TYPE_COLORS[rule.ruleType] || 'bg-gray-100 text-gray-800'}`}>
                          {RULE_TYPE_LABELS[rule.ruleType] || rule.ruleType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[250px] truncate" title={JSON.stringify(rule.conditions)}>
                        {formatConditions(rule)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(rule)}
                          className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-medium cursor-pointer ${
                            rule.active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                          title={rule.active ? 'Click to disable' : 'Click to enable'}
                        >
                          {rule.active && <Check className="h-3 w-3" />}
                          {rule.active ? 'Active' : 'Off'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => handleMovePriority(rule, 'up')}
                            disabled={idx === 0}
                            className="p-1 hover:bg-muted rounded disabled:opacity-30"
                            title="Move up (higher priority)"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleMovePriority(rule, 'down')}
                            disabled={idx === rules.length - 1}
                            className="p-1 hover:bg-muted rounded disabled:opacity-30"
                            title="Move down (lower priority)"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(rule)}
                            className="p-2 hover:bg-muted rounded"
                            title="Edit rule"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(rule)}
                            className="p-2 hover:bg-red-50 text-red-600 rounded"
                            title="Delete rule"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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

      {/* Create/Edit modal */}
      <RuleFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={editingRule ? handleUpdate : handleCreate}
        initialData={editingRule ? {
          name: editingRule.name,
          ruleType: editingRule.ruleType as ValidationRule['ruleType'],
          conditions: editingRule.conditions,
          active: editingRule.active,
          priority: editingRule.priority,
        } : undefined}
        isEdit={!!editingRule}
      />
    </div>
  );
}
