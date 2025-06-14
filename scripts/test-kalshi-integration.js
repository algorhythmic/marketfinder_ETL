/**
 * Kalshi API Integration Test Script
 * 
 * This script tests the Kalshi authentication and market fetching functionality
 * without requiring the full UI application.
 * 
 * Usage:
 *   node scripts/test-kalshi-integration.js <api-key-id> <private-key-file-path>
 */

const fs = require('fs');
const https = require('https');

// Simple placeholder for testing
function generatePlaceholderSignature(message, privateKey) {
  // This is just a placeholder implementation for development/testing
  // In production, you would implement proper RSA-PSS signing
  const crypto = require('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  
  try {
    return sign.sign({
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    }, 'base64');
  } catch (e) {
    console.error('Error signing message:', e);
    // Fallback to a simple hash for testing
    return Buffer.from(crypto.createHash('sha256').update(message).digest()).toString('base64');
  }
}

// Generate Kalshi authentication headers
function generateKalshiAuthHeaders(apiKeyId, privateKey, method, path) {
  // Current timestamp in milliseconds
  const timestamp = Date.now().toString();
  
  // Message to sign is timestamp + HTTP method + path
  const message = timestamp + method + path;
  
  // Generate signature
  const signature = generatePlaceholderSignature(message, privateKey);
  
  // Return all required headers
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'KALSHI-ACCESS-KEY': apiKeyId,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    'KALSHI-ACCESS-SIGNATURE': signature
  };
}

// Main test function
async function testKalshiIntegration(apiKeyId, privateKeyPath) {
  console.log('Testing Kalshi API integration...');
  
  try {
    // Read private key from file
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    
    // Define request parameters
    const method = 'GET';
    const path = '/v2/markets';
    const limit = 5;
    const url = `https://trading-api.kalshi.com/v2/markets?status=open&limit=${limit}`;
    
    // Generate authentication headers
    const headers = generateKalshiAuthHeaders(apiKeyId, privateKey, method, path);
    console.log('Generated authentication headers:', headers);
    
    // Make API request
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log(`Response status: ${res.statusCode}`);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const response = JSON.parse(data);
              console.log(`Successfully fetched ${response.markets?.length} markets`);
              console.log('First market:', response.markets?.[0]);
              resolve(true);
            } catch (e) {
              console.error('Error parsing response:', e);
              reject(e);
            }
          } else {
            console.error('API request failed:', data);
            reject(new Error(`API request failed with status ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('Error making request:', error);
        reject(error);
      });
      
      req.end();
    });
  } catch (error) {
    console.error('Error in test:', error);
    return false;
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node test-kalshi-integration.js <api-key-id> <private-key-file-path>');
    process.exit(1);
  }
  
  const apiKeyId = args[0];
  const privateKeyPath = args[1];
  
  testKalshiIntegration(apiKeyId, privateKeyPath)
    .then(success => {
      console.log('Test completed', success ? 'successfully' : 'with errors');
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testKalshiIntegration };
