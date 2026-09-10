import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttachmentDisplay } from './AttachmentDisplay';
import * as attachmentsLib from '../../lib/attachments';

describe('AttachmentDisplay Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    attachmentsLib.clearAttachmentDownloadUrlCache();
  });

  it('renders nothing when attachments array is empty or undefined', () => {
    const { container: c1 } = render(<AttachmentDisplay attachments={[]} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<AttachmentDisplay attachments={null} />);
    expect(c2.firstChild).toBeNull();
  });

  it('renders image attachment with preview when download URL fetch succeeds', async () => {
    vi.spyOn(attachmentsLib, 'fetchAttachmentDownloadUrl').mockResolvedValue({
      ok: true,
      url: 'https://r2.example.com/test-image.png',
    });

    const attachments = [
      {
        id: 'att-1',
        messageId: 'msg-1',
        originalName: 'screenshot.png',
        mimeType: 'image/png',
        size: 1024 * 50, // 50 KB
        createdAt: new Date(),
      },
    ];

    render(<AttachmentDisplay attachments={attachments} />);

    await waitFor(() => {
      const img = screen.getByRole('img', { name: 'screenshot.png' });
      expect(img).toBeDefined();
      expect(img.getAttribute('src')).toBe('https://r2.example.com/test-image.png');
    });

    expect(screen.getByText('screenshot.png')).toBeDefined();
    expect(screen.getByText('50.0 KB')).toBeDefined();
  });

  it('falls back to file card when image preview fails to load URL', async () => {
    vi.spyOn(attachmentsLib, 'fetchAttachmentDownloadUrl').mockResolvedValue({
      ok: false,
      error: 'File not found on storage',
    });

    const attachments = [
      {
        id: 'att-2',
        messageId: 'msg-1',
        originalName: 'broken-image.jpg',
        mimeType: 'image/jpeg',
        size: 1024 * 100, // 100 KB
        createdAt: new Date(),
      },
    ];

    render(<AttachmentDisplay attachments={attachments} />);

    await waitFor(() => {
      expect(screen.getByText('broken-image.jpg')).toBeDefined();
      expect(screen.getByText('File not found on storage')).toBeDefined();
    });
  });

  it('renders document attachment card and triggers download on click', async () => {
    const fetchSpy = vi.spyOn(attachmentsLib, 'fetchAttachmentDownloadUrl').mockResolvedValue({
      ok: true,
      url: 'https://r2.example.com/report.pdf',
    });

    const attachments = [
      {
        id: 'att-3',
        messageId: 'msg-1',
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
        size: 1024 * 1024 * 2.5, // 2.5 MB
        createdAt: new Date(),
      },
    ];

    render(<AttachmentDisplay attachments={attachments} />);

    expect(screen.getByText('report.pdf')).toBeDefined();
    expect(screen.getByText('2.5 MB')).toBeDefined();

    const downloadBtn = screen.getByRole('button', { name: 'Download report.pdf' });
    expect(downloadBtn).toBeDefined();

    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('att-3');
    });
  });
});
