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

describe('Login page', () => {
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

  it('logs in successfully with valid credentials and redirects to the dashboard', async () => {
    loginMock.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 });
    meMock.mockResolvedValue({ id: '1', firstName: 'Platform', lastName: 'Admin', email: 'admin@bata.com' });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'admin@bata.com');
    await user.type(screen.getByLabelText(/^password$/i), 'AdminPass123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith({
      email: 'admin@bata.com',
      password: 'AdminPass123!',
      tenantId: undefined,
    }));
    expect(setSessionMock).toHaveBeenCalledWith('at', 'rt');
    await waitFor(() => expect(setUserMock).toHaveBeenCalled());
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
  });

  it('shows an error message for invalid credentials and does not redirect', async () => {
    loginMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401, data: { message: 'Invalid credentials' } },
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'admin@bata.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);
    expect(pushMock).not.toHaveBeenCalled();
    expect(setSessionMock).not.toHaveBeenCalled();
  });
});
