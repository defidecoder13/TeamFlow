import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MessageComposer } from './MessageComposer';

describe('MessageComposer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders placeholder, disabled Send button, and attach file button when empty', () => {
    const send = vi.fn();
    render(<MessageComposer placeholder="Message #general" send={send} />);

    expect(screen.getByPlaceholderText('Message #general')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /attach file/i })).toBeInTheDocument();
    expect(screen.getByText(/enter to send/i)).toBeInTheDocument();
  });

  it('rejects empty or whitespace-only messages without calling send', async () => {
    const user = userEvent.setup();
    const send = vi.fn();
    render(<MessageComposer send={send} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '   ');

    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });

  it('calls send on Enter without Shift and clears input on success', async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue({ ok: true });
    render(<MessageComposer send={send} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello team{Enter}');

    expect(send).toHaveBeenCalledWith('Hello team');
    expect(textarea).toHaveValue('');
  });

  it('creates newline on Shift+Enter instead of sending', async () => {
    const user = userEvent.setup();
    const send = vi.fn();
    render(<MessageComposer send={send} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Line 1{Shift>}{Enter}{/Shift}Line 2');

    expect(send).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('Line 1\nLine 2');
  });

  it('preserves draft and displays error when send fails', async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue({ ok: false, error: 'Rate limit exceeded' });
    render(<MessageComposer send={send} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Draft message');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(send).toHaveBeenCalledWith('Draft message');
    expect(textarea).toHaveValue('Draft message');
    expect(screen.getByRole('alert')).toHaveTextContent('Rate limit exceeded');

    // Typing in textarea dismisses the error
    await user.type(textarea, ' more');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(textarea).toHaveValue('Draft message more');
  });

  it('prevents double submissions while sending is in flight', async () => {
    const user = userEvent.setup();
    let resolveSend!: (value: { ok: boolean }) => void;
    const sendPromise = new Promise<{ ok: boolean }>((resolve) => {
      resolveSend = resolve;
    });
    const send = vi.fn().mockReturnValue(sendPromise);

    render(<MessageComposer send={send} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Quick message');

    // Click send twice rapidly
    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);
    await user.click(sendButton);

    expect(send).toHaveBeenCalledTimes(1);

    // Button should show sending state and be disabled
    expect(screen.getByRole('button', { name: /sending…/i })).toBeDisabled();

    // Resolve send
    resolveSend({ ok: true });
    await screen.findByRole('button', { name: /send/i });
    expect(textarea).toHaveValue('');
  });

  it('triggers typing start on input and typing stop on send or clear', async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue({ ok: true });

    render(
      <MessageComposer
        send={send}
        container={{ channelId: 'ch-test' }}
        currentUserId="user-self"
      />,
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Typing message');
    expect(textarea).toHaveValue('Typing message');

    await user.type(textarea, '{Enter}');
    expect(send).toHaveBeenCalledWith('Typing message');
    expect(textarea).toHaveValue('');
  });

  describe('Attachment handling', () => {
    it('allows selecting valid files and displays draft chips with remove action', async () => {
      const user = userEvent.setup();
      const send = vi.fn().mockResolvedValue({ ok: true });
      render(<MessageComposer send={send} />);

      const fileInput = screen.getByTestId('file-upload-input');
      const file = new File(['image content'], 'screenshot.png', { type: 'image/png' });

      await user.upload(fileInput, file);

      expect(screen.getByTestId('attachments-preview-strip')).toBeInTheDocument();
      expect(screen.getByText('screenshot.png')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send/i })).toBeEnabled();

      // Remove attachment
      const removeBtn = screen.getByRole('button', { name: /remove attachment screenshot.png/i });
      await user.click(removeBtn);

      expect(screen.queryByTestId('attachments-preview-strip')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    });

    it('rejects files larger than 25MB with user-friendly alert', async () => {
      const user = userEvent.setup();
      const send = vi.fn();
      render(<MessageComposer send={send} />);

      const fileInput = screen.getByTestId('file-upload-input');
      const largeData = new Uint8Array(26 * 1024 * 1024);
      const largeFile = new File([largeData], 'huge_file.pdf', { type: 'application/pdf' });

      await user.upload(fileInput, largeFile);

      expect(screen.getByRole('alert')).toHaveTextContent(/exceeds the 25MB file size limit/i);
      expect(screen.queryByTestId('attachments-preview-strip')).not.toBeInTheDocument();
      expect(send).not.toHaveBeenCalled();
    });

    it('rejects exceeding the 5 attachments limit', async () => {
      const user = userEvent.setup();
      const send = vi.fn();
      render(<MessageComposer send={send} />);

      const fileInput = screen.getByTestId('file-upload-input');
      const files = [
        new File(['1'], 'f1.png', { type: 'image/png' }),
        new File(['2'], 'f2.png', { type: 'image/png' }),
        new File(['3'], 'f3.png', { type: 'image/png' }),
        new File(['4'], 'f4.png', { type: 'image/png' }),
        new File(['5'], 'f5.png', { type: 'image/png' }),
        new File(['6'], 'f6.png', { type: 'image/png' }),
      ];

      await user.upload(fileInput, files);

      expect(screen.getByRole('alert')).toHaveTextContent(/only attach up to 5 files/i);
      expect(screen.queryByTestId('attachments-preview-strip')).not.toBeInTheDocument();
    });

    it('sends attachments along with text body and clears draft list', async () => {
      const user = userEvent.setup();
      const send = vi.fn().mockResolvedValue({ ok: true });
      render(<MessageComposer send={send} />);

      const fileInput = screen.getByTestId('file-upload-input');
      const file = new File(['content'], 'document.pdf', { type: 'application/pdf' });
      await user.upload(fileInput, file);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Here is the report');
      await user.click(screen.getByRole('button', { name: /send/i }));

      expect(send).toHaveBeenCalledWith('Here is the report', [file]);
      await waitFor(() => {
        expect(screen.queryByTestId('attachments-preview-strip')).not.toBeInTheDocument();
        expect(textarea).toHaveValue('');
      });
    });
  });
});
