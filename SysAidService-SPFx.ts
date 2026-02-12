import { HttpClient, IHttpClientOptions } from '@microsoft/sp-http';
import {
  IDashboardMetrics,
  IActiveTickets,
  ISysAidTicket
} from '../models/ISysAidModels';

/**
 * SysAid Service - Backend Proxy Version
 * This version calls your Node.js backend instead of SysAid API directly
 * No more CORS issues!
 */
export class SysAidService {
  // Your backend URL (update this after deployment)
  private readonly backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';
  
  private httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * Make request to backend proxy
   */
  private async makeRequest<T>(endpoint: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
    const options: IHttpClientOptions = {
      headers: new Headers({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      })
    };

    try {
      const response = method === 'GET'
        ? await this.httpClient.get(
            `${this.backendUrl}${endpoint}`,
            HttpClient.configurations.v1,
            options
          )
        : await this.httpClient.post(
            `${this.backendUrl}${endpoint}`,
            HttpClient.configurations.v1,
            options
          );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Backend request failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.data; // Backend wraps data in { success: true, data: ... }
    } catch (error) {
      console.error(`Backend API Error (${endpoint}):`, error);
      throw error;
    }
  }

  /**
   * Get weekly metrics from backend
   */
  public async getWeeklyMetrics(): Promise<IDashboardMetrics> {
    try {
      return await this.makeRequest<IDashboardMetrics>('/api/metrics/weekly');
    } catch (error) {
      console.error('Error fetching weekly metrics:', error);
      throw error;
    }
  }

  /**
   * Get active tickets breakdown from backend
   */
  public async getActiveTickets(): Promise<IActiveTickets> {
    try {
      return await this.makeRequest<IActiveTickets>('/api/tickets/active');
    } catch (error) {
      console.error('Error fetching active tickets:', error);
      throw error;
    }
  }

  /**
   * Get detailed ticket list from backend
   */
  public async getDetailedTickets(limit: number = 50): Promise<ISysAidTicket[]> {
    try {
      return await this.makeRequest<ISysAidTicket[]>(`/api/tickets/detailed?limit=${limit}`);
    } catch (error) {
      console.error('Error fetching detailed tickets:', error);
      throw error;
    }
  }

  /**
   * Generic method to call any SysAid endpoint through the proxy
   */
  public async proxySysAidRequest<T>(
    endpoint: string, 
    method: 'GET' | 'POST' = 'GET'
  ): Promise<T> {
    try {
      return await this.makeRequest<T>(`/api/proxy${endpoint}`, method);
    } catch (error) {
      console.error('Error in proxy request:', error);
      throw error;
    }
  }
}
