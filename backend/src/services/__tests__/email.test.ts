/**
 * Unit tests for email service.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../email.js';

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    emailService = new EmailService();
  });

  describe('isValidEmail', () => {
    it('should return true for valid email addresses', () => {
      expect(emailService.isValidEmail('test@example.com')).toBe(true);
      expect(emailService.isValidEmail('user.name@domain.org')).toBe(true);
      expect(emailService.isValidEmail('user+tag@example.co.uk')).toBe(true);
      expect(emailService.isValidEmail('a@b.co')).toBe(true);
    });

    it('should return false for invalid email addresses', () => {
      expect(emailService.isValidEmail('')).toBe(false);
      expect(emailService.isValidEmail('notanemail')).toBe(false);
      expect(emailService.isValidEmail('@nodomain.com')).toBe(false);
      expect(emailService.isValidEmail('no@domain')).toBe(false);
      expect(emailService.isValidEmail('spaces in@email.com')).toBe(false);
      expect(emailService.isValidEmail('missing@.com')).toBe(false);
    });
  });

  describe('isConfigured', () => {
    it('should return true when Postmark token is set', () => {
      // With .env loaded, Postmark should be configured
      expect(emailService.isConfigured()).toBe(true);
    });
  });

  describe('sendPaymentConfirmation', () => {
    it('should return error for invalid email address', async () => {
      const result = await emailService.sendPaymentConfirmation({
        to: 'invalid-email',
        payeeName: 'John Doe',
        amountCAD: 1500.00,
        targetAmount: 1500.00,
        targetCurrency: 'CAD',
        exchangeRate: 1,
        invoiceReference: 'INV-001',
        expectedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        transferId: 12345678,
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Invalid email address');
    });

    it('should return error for empty email address', async () => {
      const result = await emailService.sendPaymentConfirmation({
        to: '',
        payeeName: 'John Doe',
        amountCAD: 1500.00,
        targetAmount: 1500.00,
        targetCurrency: 'CAD',
        exchangeRate: 1,
        invoiceReference: 'INV-001',
        expectedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        transferId: 12345678,
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Invalid email address');
    });

    // Note: Integration test for actual email sending would require
    // either a test email address verified in Postmark sandbox
    // or mocking the Postmark client
  });
});
