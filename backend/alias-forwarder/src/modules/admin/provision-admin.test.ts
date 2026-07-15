import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockFindFirst, mockSelect, mockInsert, mockUpdate, mockDelete, mockRegister, mockWriteAuditLog } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockRegister: vi.fn(),
  mockWriteAuditLog: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: { users: { findFirst: mockFindFirst } },
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
  pool: { end: vi.fn() },
}));

vi.mock('../auth/auth.service.js', () => ({
  register: mockRegister,
}));

vi.mock('./admin.service.js', () => ({
  writeAuditLog: mockWriteAuditLog,
}));

vi.mock('../../lib/redis.js', () => ({
  redis: { quit: vi.fn() },
}));

import { isDisposableEmail, runProvisioning } from './provision-admin.service.js';

describe('Disposable Admin Provisioning Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isDisposableEmail', () => {
    it('allows valid disposable emails', () => {
      expect(isDisposableEmail('qa-123@example.com')).toBe(true);
      expect(isDisposableEmail('test-abc@shieldme.qa')).toBe(true);
      expect(isDisposableEmail('disposable-xyz@disposable.shieldme.local')).toBe(true);
      expect(isDisposableEmail('QA-USER@EXAMPLE.COM')).toBe(true);
    });

    it('rejects non-disposable emails', () => {
      // Wrong prefix:
      expect(isDisposableEmail('admin@example.com')).toBe(false);
      expect(isDisposableEmail('realuser@shieldme.qa')).toBe(false);

      // Wrong domain:
      expect(isDisposableEmail('qa-user@gmail.com')).toBe(false);
      expect(isDisposableEmail('test-user@shieldme.com')).toBe(false);

      // Completely wrong:
      expect(isDisposableEmail('random@domain.com')).toBe(false);
    });
  });

  describe('runProvisioning promote', () => {
    it('throws if confirm flag is missing', async () => {
      await expect(
        runProvisioning('promote', { email: 'qa-user@example.com', confirm: false })
      ).rejects.toThrow('Action must be run with the --confirm flag.');
    });

    it('throws if email is not disposable', async () => {
      await expect(
        runProvisioning('promote', { email: 'admin@shieldme.com', confirm: true })
      ).rejects.toThrow('is not disposable/QA-safe.');
    });

    it('promotes an existing user to admin', async () => {
      const mockUser = { id: 'user-uuid', email: 'qa-user@example.com', role: 'user' };
      mockFindFirst.mockResolvedValue(mockUser);

      const mockUpdateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'user-uuid', role: 'admin' }])
        })
      };
      mockUpdate.mockReturnValue(mockUpdateChain);

      const result = await runProvisioning('promote', { email: 'qa-user@example.com', confirm: true });

      expect(result.status).toBe('promoted');
      expect(result.userId).toBe('user-uuid');
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        'admin.provisioned',
        'user',
        'user-uuid',
        expect.objectContaining({ email: 'qa-user@example.com' }),
        { type: 'system', id: 'cli-operator' }
      );
    });

    it('returns already_admin if user is already admin', async () => {
      const mockUser = { id: 'user-uuid', email: 'qa-user@example.com', role: 'admin' };
      mockFindFirst.mockResolvedValue(mockUser);

      const result = await runProvisioning('promote', { email: 'qa-user@example.com', confirm: true });

      expect(result.status).toBe('already_admin');
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockWriteAuditLog).not.toHaveBeenCalled();
    });

    it('creates and promotes new user if not exists', async () => {
      mockFindFirst.mockResolvedValue(null);
      mockRegister.mockResolvedValue({
        user: { id: 'new-user-uuid', email: 'qa-new@example.com', role: 'user' }
      });

      const mockUpdateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'new-user-uuid', role: 'admin' }])
        })
      };
      mockUpdate.mockReturnValue(mockUpdateChain);

      const result = await runProvisioning('promote', {
        email: 'qa-new@example.com',
        password: 'Password12345!',
        confirm: true
      });

      expect(result.status).toBe('created_and_promoted');
      expect(result.userId).toBe('new-user-uuid');
      expect(mockRegister).toHaveBeenCalledWith({
        email: 'qa-new@example.com',
        password: 'Password12345!'
      });
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        'admin.provisioned',
        'user',
        'new-user-uuid',
        expect.objectContaining({ email: 'qa-new@example.com' }),
        { type: 'system', id: 'cli-operator' }
      );
    });
  });

  describe('runProvisioning demote', () => {
    it('throws if user not found', async () => {
      mockFindFirst.mockResolvedValue(null);
      await expect(
        runProvisioning('demote', { email: 'qa-user@example.com', confirm: true })
      ).rejects.toThrow('User qa-user@example.com not found');
    });

    it('returns not_admin if user is not admin', async () => {
      const mockUser = { id: 'user-uuid', email: 'qa-user@example.com', role: 'user' };
      mockFindFirst.mockResolvedValue(mockUser);

      const result = await runProvisioning('demote', { email: 'qa-user@example.com', confirm: true });
      expect(result.status).toBe('not_admin');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('demotes admin back to user', async () => {
      const mockUser = { id: 'user-uuid', email: 'qa-user@example.com', role: 'admin' };
      mockFindFirst.mockResolvedValue(mockUser);

      const mockUpdateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'user-uuid', role: 'user' }])
        })
      };
      mockUpdate.mockReturnValue(mockUpdateChain);

      const result = await runProvisioning('demote', { email: 'qa-user@example.com', confirm: true });
      expect(result.status).toBe('demoted');
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        'admin.demoted',
        'user',
        'user-uuid',
        expect.objectContaining({ email: 'qa-user@example.com' }),
        { type: 'system', id: 'cli-operator' }
      );
    });
  });

  describe('runProvisioning cleanup', () => {
    it('deletes a single disposable user', async () => {
      const mockUser = { id: 'user-uuid', email: 'qa-user@example.com' };
      mockFindFirst.mockResolvedValue(mockUser);

      const mockDeleteChain = {
        where: vi.fn().mockResolvedValue([])
      };
      mockDelete.mockReturnValue(mockDeleteChain);

      const result = await runProvisioning('cleanup', { email: 'qa-user@example.com', confirm: true });
      expect(result.status).toBe('deleted');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        'admin.cleaned_up',
        'user',
        'user-uuid',
        expect.objectContaining({ email: 'qa-user@example.com' }),
        { type: 'system', id: 'cli-operator' }
      );
    });

    it('cleans up all disposable users', async () => {
      const allUsersList = [
        { id: 'uuid-1', email: 'qa-user1@example.com', role: 'admin' },
        { id: 'uuid-2', email: 'test-user2@shieldme.qa', role: 'user' },
        { id: 'uuid-3', email: 'realadmin@shieldme.com', role: 'admin' }, // Protected
      ];

      mockSelect.mockReturnValue({
        from: vi.fn().mockResolvedValue(allUsersList)
      });

      const mockDeleteChain = {
        where: vi.fn().mockResolvedValue([])
      };
      mockDelete.mockReturnValue(mockDeleteChain);

      const result = await runProvisioning('cleanup', { all: true, confirm: true });

      expect(result.count).toBe(2);
      expect(result.deleted).toContain('qa-user1@example.com');
      expect(result.deleted).toContain('test-user2@shieldme.qa');
      expect(result.deleted).not.toContain('realadmin@shieldme.com');

      expect(mockDelete).toHaveBeenCalled();
      expect(mockWriteAuditLog).toHaveBeenCalledTimes(2);
    });
  });
});
