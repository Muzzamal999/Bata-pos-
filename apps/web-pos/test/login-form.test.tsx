import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const loginMock = vi.fn();
const meMock = vi.fn();
vi.mock('../lib/api', () => ({
  identityApi: {
    login: (...args: unknown[]) => loginMock(...args),
    me: (...args: unknown[]) => meMock(...args),
  },
}));

const setSessionMock = vi.fn();
const setUserMock = vi.fn();
vi.mock('../lib/auth-store', () => ({
  useAuthStore: { getState: () => ({ setSession: setSessionMock, setUser: setUserMock }) },
}));

// Imported after the mocks above so the page picks up the mocked modules.
import LoginPage from '../app/(auth)/login/page';

describe('Cashier login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows validation errors for missing required fields and never calls the API', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('logs a cashier in with valid credentials and routes to branch selection, not straight to sales', async () => {
    loginMock.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 });
    meMock.mockResolvedValue({ id: '1', firstName: 'Ayesha', lastName: 'Khan', email: 'cashier@bata.com' });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'cashier@bata.com');
    await user.type(screen.getByLabelText(/^password$/i), 'Cashier@12345');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        email: 'cashier@bata.com',
        password: 'Cashier@12345',
        tenantId: undefined,
      }),
    );
    expect(setSessionMock).toHaveBeenCalledWith('at', 'rt');
    await waitFor(() => expect(setUserMock).toHaveBeenCalled());
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/select-branch'));
  });

  it('passes the organization ID through when the cashier opens and fills the advanced field', async () => {
    loginMock.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 });
    meMock.mockResolvedValue({ id: '1', firstName: 'Ayesha', lastName: 'Khan', email: 'cashier@bata.com' });
    const tenantId = 'e2b38e07-48dd-4df9-b70e-96d3d787f85d';

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: /signing into a store account/i }));
    await user.type(screen.getByLabelText(/email/i), 'cashier@bata.com');
    await user.type(screen.getByLabelText(/^password$/i), 'Cashier@12345');
    await user.type(screen.getByLabelText(/organization id/i), tenantId);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        email: 'cashier@bata.com',
        password: 'Cashier@12345',
        tenantId,
      }),
    );
  });

  it('shows an error message for invalid credentials and does not redirect', async () => {
    loginMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401, data: { message: 'Invalid credentials' } },
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'cashier@bata.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);
    expect(pushMock).not.toHaveBeenCalled();
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it('toggles the password field between masked and plain text', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const password = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(password.type).toBe('password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password.type).toBe('text');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(password.type).toBe('password');
  });
});
