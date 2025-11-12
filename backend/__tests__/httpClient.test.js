import { jest } from '@jest/globals';
import { HttpClient } from '../lib/httpClient.js';

describe('HttpClient', () => {
  let client;

  beforeEach(() => {
    client = new HttpClient();
  });

  describe('request method - happy path', () => {
    beforeEach(() => {
      // Mock fetch for successful requests
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should make a successful GET request and return JSON', async () => {
      const mockData = { message: 'success', id: 123 };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue(mockData),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await client.request({
        url: 'https://api.example.com/data',
        method: 'GET',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(result).toEqual({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: mockData,
      });
    });

    it('should make a successful POST request with data', async () => {
      const requestData = { name: 'Test', value: 42 };
      const mockResponse = {
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ id: 456, ...requestData }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await client.request({
        url: 'https://api.example.com/create',
        method: 'POST',
        data: requestData,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/create',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(result.status).toBe(201);
      expect(result.body).toEqual({ id: 456, ...requestData });
    });

    it('should handle custom headers', async () => {
      const mockData = { result: 'ok' };
      const customHeaders = { 'Authorization': 'Bearer token123' };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue(mockData),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await client.request({
        url: 'https://api.example.com/secure',
        method: 'GET',
        headers: customHeaders,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/secure',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token123',
          }),
        })
      );
    });

    it('should handle text responses', async () => {
      const mockText = 'Plain text response';
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/plain']]),
        text: jest.fn().mockResolvedValue(mockText),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await client.request({
        url: 'https://api.example.com/text',
        method: 'GET',
      });

      expect(result.body).toBe(mockText);
    });
  });

  describe('healthCheck method - happy path', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return healthy status for successful HEAD request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await client.healthCheck('https://api.example.com/health');

      expect(result.healthy).toBe(true);
      expect(result.status).toBe(200);
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/health',
        expect.objectContaining({ method: 'HEAD' })
      );
    });

    it('should measure latency in health check', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
      };

      global.fetch.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockResponse), 10))
      );

      const result = await client.healthCheck('https://api.example.com/health');

      expect(result.latency).toBeGreaterThanOrEqual(10);
      expect(result.healthy).toBe(true);
    });
  });
});
