import axios from 'axios';
import type {
  AuthTokens,
  Branch,
  CreateBranchRequest,
  CreateRoleRequest,
  CreateTenantRequest,
  CreateUserRequest,
  CurrentUser,
  LoginRequest,
  PaginatedResult,
  PaginationParams,
  Permission,
  Role,
  Tenant,
  UpdateBranchRequest,
  UpdateRoleRequest,
  UpdateTenantRequest,
  UpdateUserRequest,
  User,
} from '@bata-pos/shared-types';
import { createHttpClient, AuthHooks } from './http-client';

interface TenantScopedListParams extends PaginationParams {
  tenantId?: string;
}

export class IdentityApi {
  /** A plain, unauthenticated client - login/refresh issue tokens, they can't require one. */
  private readonly anonymous;
  /** The authenticated client, for every other endpoint. */
  private readonly client;

  constructor(baseURL: string, authHooks: AuthHooks) {
    this.anonymous = axios.create({ baseURL });
    this.client = createHttpClient(baseURL, authHooks);
  }

  // --- Auth ---

  async login(request: LoginRequest): Promise<AuthTokens> {
    const { data } = await this.anonymous.post<AuthTokens>('/auth/login', request);
    return data;
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const { data } = await this.anonymous.post<AuthTokens>('/auth/refresh', { refreshToken });
    return data;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.client.post('/auth/logout', { refreshToken });
  }

  async me(): Promise<CurrentUser> {
    const { data } = await this.client.get<CurrentUser>('/auth/me');
    return data;
  }

  // --- Branches ---

  async listBranches(params?: TenantScopedListParams): Promise<PaginatedResult<Branch>> {
    const { data } = await this.client.get<PaginatedResult<Branch>>('/branches', { params });
    return data;
  }

  async getBranch(id: string): Promise<Branch> {
    const { data } = await this.client.get<Branch>(`/branches/${id}`);
    return data;
  }

  async createBranch(request: CreateBranchRequest): Promise<Branch> {
    const { data } = await this.client.post<Branch>('/branches', request);
    return data;
  }

  async updateBranch(id: string, request: UpdateBranchRequest): Promise<Branch> {
    const { data } = await this.client.patch<Branch>(`/branches/${id}`, request);
    return data;
  }

  async activateBranch(id: string): Promise<Branch> {
    const { data } = await this.client.patch<Branch>(`/branches/${id}/activate`);
    return data;
  }

  async deactivateBranch(id: string): Promise<Branch> {
    const { data } = await this.client.patch<Branch>(`/branches/${id}/deactivate`);
    return data;
  }

  // --- Users ---

  async listUsers(params?: TenantScopedListParams): Promise<PaginatedResult<User>> {
    const { data } = await this.client.get<PaginatedResult<User>>('/users', { params });
    return data;
  }

  async getUser(id: string): Promise<User> {
    const { data } = await this.client.get<User>(`/users/${id}`);
    return data;
  }

  async createUser(request: CreateUserRequest): Promise<User> {
    const { data } = await this.client.post<User>('/users', request);
    return data;
  }

  async updateUser(id: string, request: UpdateUserRequest): Promise<User> {
    const { data } = await this.client.patch<User>(`/users/${id}`, request);
    return data;
  }

  async activateUser(id: string): Promise<User> {
    const { data } = await this.client.patch<User>(`/users/${id}/activate`);
    return data;
  }

  async deactivateUser(id: string): Promise<User> {
    const { data } = await this.client.patch<User>(`/users/${id}/deactivate`);
    return data;
  }

  async assignUserRole(userId: string, roleId: string): Promise<void> {
    await this.client.post(`/users/${userId}/roles`, { roleId });
  }

  async removeUserRole(userId: string, roleId: string): Promise<void> {
    await this.client.delete(`/users/${userId}/roles/${roleId}`);
  }

  async assignUserBranch(userId: string, branchId: string): Promise<void> {
    await this.client.post(`/users/${userId}/branches`, { branchId });
  }

  async removeUserBranch(userId: string, branchId: string): Promise<void> {
    await this.client.delete(`/users/${userId}/branches/${branchId}`);
  }

  // --- Roles ---

  async listRoles(params?: TenantScopedListParams): Promise<PaginatedResult<Role>> {
    const { data } = await this.client.get<PaginatedResult<Role>>('/roles', { params });
    return data;
  }

  async getRole(id: string): Promise<Role> {
    const { data } = await this.client.get<Role>(`/roles/${id}`);
    return data;
  }

  async createRole(request: CreateRoleRequest): Promise<Role> {
    const { data } = await this.client.post<Role>('/roles', request);
    return data;
  }

  async updateRole(id: string, request: UpdateRoleRequest): Promise<Role> {
    const { data } = await this.client.patch<Role>(`/roles/${id}`, request);
    return data;
  }

  async deleteRole(id: string): Promise<void> {
    await this.client.delete(`/roles/${id}`);
  }

  async assignRolePermission(roleId: string, permissionId: string): Promise<void> {
    await this.client.post(`/roles/${roleId}/permissions`, { permissionId });
  }

  async removeRolePermission(roleId: string, permissionId: string): Promise<void> {
    await this.client.delete(`/roles/${roleId}/permissions/${permissionId}`);
  }

  // --- Permissions ---

  async listPermissions(params?: PaginationParams): Promise<PaginatedResult<Permission>> {
    const { data } = await this.client.get<PaginatedResult<Permission>>('/permissions', { params });
    return data;
  }

  // --- Tenants (platform-level callers only) ---

  async listTenants(params?: PaginationParams): Promise<PaginatedResult<Tenant>> {
    const { data } = await this.client.get<PaginatedResult<Tenant>>('/tenants', { params });
    return data;
  }

  async getTenant(id: string): Promise<Tenant> {
    const { data } = await this.client.get<Tenant>(`/tenants/${id}`);
    return data;
  }

  async createTenant(request: CreateTenantRequest): Promise<Tenant> {
    const { data } = await this.client.post<Tenant>('/tenants', request);
    return data;
  }

  async updateTenant(id: string, request: UpdateTenantRequest): Promise<Tenant> {
    const { data } = await this.client.patch<Tenant>(`/tenants/${id}`, request);
    return data;
  }

  async activateTenant(id: string): Promise<Tenant> {
    const { data } = await this.client.patch<Tenant>(`/tenants/${id}/activate`);
    return data;
  }

  async deactivateTenant(id: string): Promise<Tenant> {
    const { data } = await this.client.patch<Tenant>(`/tenants/${id}/deactivate`);
    return data;
  }
}
