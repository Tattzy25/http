// backend/api/connections/execute.js - PRODUCTION READY
// This actually executes the connection between two endpoints
// Real HTTP requests, real data mapping, real logging

import { HttpClient } from '../../lib/httpClient.js';
import { DataMapper } from '../../lib/dataMapper.js';
import { GoogleSheets } from '../../lib/googleSheets.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { connectionId, sourceData } = req.body;

    if (!connectionId) {
      return res.status(400).json({ error: 'Connection ID required' });
    }

    const sheets = new GoogleSheets();
    const startTime = Date.now();

    // Get connection config from storage
    const connection = await sheets.getConnection(connectionId);
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // STEP 1: Call source endpoint (real HTTP request)
    const httpClient = new HttpClient();
    let sourceResponse;

    try {
      sourceResponse = await httpClient.request({
        url: connection.sourceUrl,
        method: sourceData?.method || 'GET',
        headers: connection.authSource ? {
          'Authorization': `Bearer ${process.env[connection.authSource]}`
        } : {},
        data: sourceData?.body || {}
      });
    } catch (error) {
      // Log failure
      await sheets.logEvent({
        connectionId,
        event: 'EXECUTION_FAILED',
        timestamp: new Date().toISOString(),
        status: 'error',
        error: error.message,
        duration: Date.now() - startTime
      });

      return res.status(500).json({
        success: false,
        error: `Source endpoint failed: ${error.message}`
      });
    }

    // STEP 2: Map data (transform source response for destination)
    const mapper = new DataMapper();
    let mappedData;

    try {
      mappedData = mapper.transform(sourceResponse, connection.mapping);
    } catch (error) {
      await sheets.logEvent({
        connectionId,
        event: 'MAPPING_FAILED',
        timestamp: new Date().toISOString(),
        status: 'error',
        error: error.message
      });

      return res.status(400).json({
        success: false,
        error: `Data mapping failed: ${error.message}`
      });
    }

    // STEP 3: Call destination endpoint (real HTTP request with mapped data)
    let destResponse;

    try {
      destResponse = await httpClient.request({
        url: connection.destUrl,
        method: 'POST',
        headers: connection.authDest ? {
          'Authorization': `Bearer ${process.env[connection.authDest]}`,
          'Content-Type': 'application/json'
        } : {
          'Content-Type': 'application/json'
        },
        data: mappedData
      });
    } catch (error) {
      await sheets.logEvent({
        connectionId,
        event: 'DESTINATION_FAILED',
        timestamp: new Date().toISOString(),
        status: 'error',
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: `Destination endpoint failed: ${error.message}`
      });
    }

    // STEP 4: Log successful execution
    const duration = Date.now() - startTime;

    await sheets.logEvent({
      connectionId,
      event: 'EXECUTION_SUCCESS',
      timestamp: new Date().toISOString(),
      status: 'success',
      duration,
      sourceStatus: sourceResponse.status,
      destStatus: destResponse.status,
      dataSize: JSON.stringify(mappedData).length
    });

    // Update connection stats
    connection.stats.executionCount += 1;
    connection.stats.successCount += 1;
    await sheets.updateConnection(connectionId, connection);

    return res.status(200).json({
      success: true,
      data: {
        connectionId,
        status: 'executed',
        duration: `${duration}ms`,
        sourceStatus: sourceResponse.status,
        destStatus: destResponse.status,
        message: 'Data successfully transformed and sent'
      }
    });

  } catch (error) {
    console.error('Execution error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
