/**
 * Validation rules engine.
 * Evaluates configurable rules against bill data.
 *
 * Rule types:
 * - required_field: Checks that a specified field is present and non-empty
 * - amount_threshold: Flags bills over a configurable amount for extra review
 * - approval_required: Checks that a specified approval status is met
 * - duplicate_detection: Detects duplicate bills (same partner + amount + date)
 * - custom: Evaluates a custom condition expression
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { ValidationRule } from '@prisma/client';

export interface BillData {
  uid: string;
  payeeName: string;
  clientName: string;
  amount: number;
  description: string;
  tenantCode: string;
  date?: string;
  status?: string;
  qboInvoiceNum?: string | null;
  qboBillNum?: string | null;
  [key: string]: unknown;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  passed: boolean;
  reason: string;
}

export interface ValidationResult {
  billId: string;
  passed: boolean;
  results: RuleResult[];
  failedCount: number;
  passedCount: number;
}

// Conditions type definitions for each rule type
interface RequiredFieldConditions {
  field: string;
  label?: string;
}

interface AmountThresholdConditions {
  threshold: number;
  message?: string;
}

interface ApprovalRequiredConditions {
  field: string;
  requiredValue: string;
  label?: string;
}

interface DuplicateDetectionConditions {
  fields: string[];
  message?: string;
}

interface CustomConditions {
  expression: string;
  message?: string;
}

/**
 * Get all active rules sorted by priority.
 */
export async function getActiveRules(): Promise<ValidationRule[]> {
  return prisma.validationRule.findMany({
    where: { active: true },
    orderBy: { priority: 'asc' },
  });
}

/**
 * Get all rules (active and inactive) sorted by priority.
 */
export async function getAllRules(): Promise<ValidationRule[]> {
  return prisma.validationRule.findMany({
    orderBy: { priority: 'asc' },
  });
}

/**
 * Evaluate a single rule against bill data.
 */
function evaluateRule(rule: ValidationRule, bill: BillData, allBills?: BillData[]): RuleResult {
  const conditions = rule.conditions as Record<string, unknown>;

  switch (rule.ruleType) {
    case 'required_field':
      return evaluateRequiredField(rule, bill, conditions as unknown as RequiredFieldConditions);

    case 'amount_threshold':
      return evaluateAmountThreshold(rule, bill, conditions as unknown as AmountThresholdConditions);

    case 'approval_required':
      return evaluateApprovalRequired(rule, bill, conditions as unknown as ApprovalRequiredConditions);

    case 'duplicate_detection':
      return evaluateDuplicateDetection(rule, bill, conditions as unknown as DuplicateDetectionConditions, allBills);

    case 'custom':
      return evaluateCustom(rule, bill, conditions as unknown as CustomConditions);

    default:
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        passed: false,
        reason: `Unknown rule type: ${rule.ruleType}`,
      };
  }
}

function evaluateRequiredField(
  rule: ValidationRule,
  bill: BillData,
  conditions: RequiredFieldConditions
): RuleResult {
  const { field, label } = conditions;
  const value = bill[field];
  const displayName = label || field;

  const passed = value !== undefined && value !== null && value !== '';

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.ruleType,
    passed,
    reason: passed
      ? `${displayName} is present`
      : `Missing required field: ${displayName}`,
  };
}

function evaluateAmountThreshold(
  rule: ValidationRule,
  bill: BillData,
  conditions: AmountThresholdConditions
): RuleResult {
  const { threshold, message } = conditions;
  const passed = bill.amount <= threshold;

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.ruleType,
    passed,
    reason: passed
      ? `Amount $${bill.amount.toFixed(2)} within threshold ($${threshold.toLocaleString()})`
      : message || `Amount $${bill.amount.toFixed(2)} exceeds threshold of $${threshold.toLocaleString()} — extra approval required`,
  };
}

function evaluateApprovalRequired(
  rule: ValidationRule,
  bill: BillData,
  conditions: ApprovalRequiredConditions
): RuleResult {
  const { field, requiredValue, label } = conditions;
  const value = String(bill[field] ?? '');
  const displayName = label || field;
  const passed = value.toLowerCase() === requiredValue.toLowerCase();

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.ruleType,
    passed,
    reason: passed
      ? `${displayName} is ${requiredValue}`
      : `${displayName} is "${value}" (required: ${requiredValue})`,
  };
}

function evaluateDuplicateDetection(
  rule: ValidationRule,
  bill: BillData,
  conditions: DuplicateDetectionConditions,
  allBills?: BillData[]
): RuleResult {
  if (!allBills || allBills.length === 0) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.ruleType,
      passed: true,
      reason: 'No other bills to compare for duplicates',
    };
  }

  const { fields, message } = conditions;
  const duplicates = allBills.filter(other => {
    if (other.uid === bill.uid) return false;
    return fields.every(f => {
      const billVal = String(bill[f] ?? '').toLowerCase();
      const otherVal = String(other[f] ?? '').toLowerCase();
      return billVal === otherVal && billVal !== '';
    });
  });

  const passed = duplicates.length === 0;

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.ruleType,
    passed,
    reason: passed
      ? 'No duplicate bills detected'
      : message || `Possible duplicate: ${duplicates.length} other bill(s) match on ${fields.join(', ')}`,
  };
}

function evaluateCustom(
  rule: ValidationRule,
  bill: BillData,
  conditions: CustomConditions
): RuleResult {
  const { expression, message } = conditions;

  try {
    // Simple expression evaluator: supports field comparisons
    // e.g., "amount > 0", "tenantCode == US"
    const passed = evaluateExpression(expression, bill);
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.ruleType,
      passed,
      reason: passed
        ? `Custom check passed: ${expression}`
        : message || `Custom check failed: ${expression}`,
    };
  } catch (err) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.ruleType,
      passed: false,
      reason: `Expression error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Simple expression evaluator for custom rules.
 * Supports: field > value, field < value, field == value, field != value
 */
function evaluateExpression(expression: string, bill: BillData): boolean {
  const operators = ['!=', '>=', '<=', '==', '>', '<'];
  for (const op of operators) {
    const parts = expression.split(op).map(s => s.trim());
    if (parts.length === 2) {
      const [field, rawValue] = parts;
      const billValue = bill[field];
      const numValue = Number(rawValue);

      if (!isNaN(numValue) && typeof billValue === 'number') {
        switch (op) {
          case '>': return billValue > numValue;
          case '<': return billValue < numValue;
          case '>=': return billValue >= numValue;
          case '<=': return billValue <= numValue;
          case '==': return billValue === numValue;
          case '!=': return billValue !== numValue;
        }
      } else {
        const strBillValue = String(billValue ?? '').toLowerCase();
        const strCompare = rawValue.toLowerCase().replace(/['"]/g, '');
        switch (op) {
          case '==': return strBillValue === strCompare;
          case '!=': return strBillValue !== strCompare;
          default: return false;
        }
      }
    }
  }
  throw new Error(`Invalid expression: ${expression}`);
}

/**
 * Run all active validation rules against a single bill.
 */
export async function validateBill(
  bill: BillData,
  allBills?: BillData[]
): Promise<ValidationResult> {
  const rules = await getActiveRules();
  const results = rules.map(rule => evaluateRule(rule, bill, allBills));

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  return {
    billId: bill.uid,
    passed: failedCount === 0,
    results,
    failedCount,
    passedCount,
  };
}

/**
 * Seed default validation rules if none exist.
 */
export async function seedDefaultRules(): Promise<void> {
  const count = await prisma.validationRule.count();
  if (count > 0) return;

  const defaults: Array<{
    name: string;
    ruleType: string;
    conditions: Record<string, unknown>;
    priority: number;
  }> = [
    {
      name: 'Payee Name Required',
      ruleType: 'required_field',
      conditions: { field: 'payeeName', label: 'Payee Name' },
      priority: 1,
    },
    {
      name: 'Amount Required',
      ruleType: 'required_field',
      conditions: { field: 'amount', label: 'Amount' },
      priority: 2,
    },
    {
      name: 'Date Required',
      ruleType: 'required_field',
      conditions: { field: 'date', label: 'Date' },
      priority: 3,
    },
    {
      name: 'Description Required',
      ruleType: 'required_field',
      conditions: { field: 'description', label: 'Description' },
      priority: 4,
    },
    {
      name: 'High Amount Review',
      ruleType: 'amount_threshold',
      conditions: {
        threshold: 10000,
        message: 'Bill exceeds $10,000 — requires additional approval',
      },
      priority: 10,
    },
    {
      name: 'Duplicate Bill Detection',
      ruleType: 'duplicate_detection',
      conditions: {
        fields: ['payeeName', 'amount', 'date'],
        message: 'Possible duplicate: another bill has the same payee, amount, and date',
      },
      priority: 20,
    },
  ];

  for (const rule of defaults) {
    await prisma.validationRule.create({
      data: {
        name: rule.name,
        ruleType: rule.ruleType,
        conditions: rule.conditions as Prisma.InputJsonValue,
        active: true,
        priority: rule.priority,
      },
    });
  }
}
